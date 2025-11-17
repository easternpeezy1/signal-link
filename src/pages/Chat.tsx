import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Shield, LogOut, Lock } from 'lucide-react';
import { generateKeyPair, storeKeys, getKeys, publicKeyToBase64 } from '@/lib/crypto';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import UserList from '@/components/UserList';
import MessageInterface from '@/components/MessageInterface';

export default function Chat() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [keysReady, setKeysReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string>('');
  const [selectedPeer, setSelectedPeer] = useState<{
    id: string;
    name: string;
    publicKey: string;
  } | null>(null);

  useEffect(() => {
    if (!user) {
      navigate('/auth');
      return;
    }

    initializeKeys();
  }, [user, navigate]);

  const initializeKeys = async () => {
    const keys = await getKeys();
    
    if (!keys) {
      const newKeys = await generateKeyPair();
      await storeKeys(newKeys.publicKey, newKeys.privateKey);
      const pubKey = publicKeyToBase64(newKeys.publicKey);
      setPublicKey(pubKey);
      
      // Store public key in profile
      await supabase
        .from('profiles')
        .update({ public_key: pubKey } as any)
        .eq('user_id', user!.id);
      
      toast.success('Encryption keys generated locally');
    } else {
      const pubKey = publicKeyToBase64(keys.publicKey);
      setPublicKey(pubKey);
      
      // Ensure public key is in profile
      await supabase
        .from('profiles')
        .update({ public_key: pubKey } as any)
        .eq('user_id', user!.id);
    }
    
    setKeysReady(true);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const handleSelectUser = (userId: string, username: string, peerPublicKey: string) => {
    setSelectedPeer({ id: userId, name: username, publicKey: peerPublicKey });
  };

  if (!keysReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="text-muted-foreground">Setting up encryption...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
              <Shield className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">SecureChat</h1>
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" />
                End-to-end encrypted
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={handleSignOut}>
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="w-80">
          <UserList onSelectUser={handleSelectUser} />
        </div>
        <div className="flex-1">
          {selectedPeer ? (
            <MessageInterface
              peerId={selectedPeer.id}
              peerName={selectedPeer.name}
              peerPublicKey={selectedPeer.publicKey}
              onClose={() => setSelectedPeer(null)}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-center space-y-4 px-8">
              <div>
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Shield className="h-8 w-8 text-primary" />
                </div>
                <h2 className="text-xl font-semibold mb-2">P2P Encrypted Messenger</h2>
                <p className="text-muted-foreground mb-6">
                  Select a user to start a secure peer-to-peer conversation
                </p>
                <div className="text-sm text-muted-foreground space-y-2">
                  <p className="flex items-center gap-2 justify-center">
                    <Lock className="h-4 w-4" />
                    Zero-knowledge - messages never stored on servers
                  </p>
                  <p className="flex items-center gap-2 justify-center">
                    <Shield className="h-4 w-4" />
                    WebRTC P2P with E2E encryption
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}