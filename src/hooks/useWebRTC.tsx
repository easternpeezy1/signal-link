import { useState, useEffect, useRef } from 'react';
import SimplePeer from 'simple-peer';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { encryptMessage, decryptMessage, generateSharedSecret, getKeys, base64ToPublicKey } from '@/lib/crypto';

interface Message {
  id: string;
  text: string;
  sender: string;
  timestamp: number;
  encrypted: boolean;
}

export function useWebRTC(peerId: string, peerPublicKey: string) {
  const { user } = useAuth();
  const [peer, setPeer] = useState<SimplePeer.Instance | null>(null);
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sharedSecret, setSharedSecret] = useState<Uint8Array | null>(null);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    if (!user || !peerId) return;

    const initPeer = async () => {
      // Generate shared secret for encryption
      const keys = await getKeys();
      if (!keys) return;

      const peerPubKey = base64ToPublicKey(peerPublicKey);
      const secret = await generateSharedSecret(keys.privateKey, peerPubKey);
      setSharedSecret(secret);

      // Create peer connection
      const isInitiator = user.id < peerId; // Deterministic initiator
      
      const peerConnection = new SimplePeer({
        initiator: isInitiator,
        trickle: true,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      // Listen for signaling data
      peerConnection.on('signal', async (data) => {
        const message = {
          type: data.type === 'offer' ? 'offer' : data.type === 'answer' ? 'answer' : 'ice-candidate',
          from: user.id,
          to: peerId,
          payload: data
        };

        // Broadcast via Supabase Realtime
        const channel = supabase.channel(`signaling:${user.id}`);
        await channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: message
        });
      });

      peerConnection.on('connect', () => {
        console.log('WebRTC connected');
        setConnected(true);
      });

      peerConnection.on('data', async (data) => {
        const encryptedMsg = JSON.parse(data.toString());
        if (secret) {
          const decrypted = await decryptMessage(encryptedMsg.text, secret);
          setMessages(prev => [...prev, {
            id: encryptedMsg.id,
            text: decrypted,
            sender: peerId,
            timestamp: encryptedMsg.timestamp,
            encrypted: true
          }]);
        }
      });

      peerConnection.on('close', () => {
        console.log('Peer connection closed');
        setConnected(false);
      });

      peerConnection.on('error', (err) => {
        console.error('Peer error:', err);
        setConnected(false);
      });

      setPeer(peerConnection);

      // Set up signaling channel
      const signalingChannel = supabase.channel(`signaling:${peerId}`);
      signalingChannel
        .on('broadcast', { event: 'signal' }, (payload) => {
          const msg = payload.payload;
          if (msg.to === user.id) {
            peerConnection.signal(msg.payload);
          }
        })
        .subscribe();

      channelRef.current = signalingChannel;
    };

    initPeer();

    return () => {
      peer?.destroy();
      channelRef.current?.unsubscribe();
    };
  }, [peerId, peerPublicKey, user]);

  const sendMessage = async (text: string) => {
    if (!peer || !connected || !sharedSecret) return;

    const encrypted = await encryptMessage(text, sharedSecret);
    const message = {
      id: crypto.randomUUID(),
      text: encrypted,
      timestamp: Date.now()
    };

    peer.send(JSON.stringify(message));

    // Add to local messages
    setMessages(prev => [...prev, {
      id: message.id,
      text: text,
      sender: user?.id || '',
      timestamp: message.timestamp,
      encrypted: true
    }]);
  };

  return { connected, messages, sendMessage };
}
