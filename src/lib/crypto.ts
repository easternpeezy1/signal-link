// Zero-knowledge cryptography utilities using proper ECDH and AEAD
// All encryption happens locally - keys never leave the device

// @ts-ignore - @noble/curves types may not be perfect
import { x25519 } from '@noble/curves/ed25519';
import localforage from 'localforage';

const KEYS_STORE = 'securechat_keys';

// Generate a new X25519 keypair for the user
export async function generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const privateKey = x25519.utils.randomPrivateKey();
  const publicKey = x25519.getPublicKey(privateKey);
  
  return { publicKey, privateKey };
}

// Store keys locally (never sent to server)
export async function storeKeys(publicKey: Uint8Array, privateKey: Uint8Array): Promise<void> {
  await localforage.setItem(KEYS_STORE, {
    publicKey: Array.from(publicKey),
    privateKey: Array.from(privateKey),
  });
}

// Retrieve keys from local storage
export async function getKeys(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array } | null> {
  const stored = await localforage.getItem<{ publicKey: number[]; privateKey: number[] }>(KEYS_STORE);
  if (!stored) return null;
  
  return {
    publicKey: new Uint8Array(stored.publicKey),
    privateKey: new Uint8Array(stored.privateKey),
  };
}

// Generate shared secret using X25519 ECDH
export async function generateSharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Promise<Uint8Array> {
  // Perform ECDH key exchange
  const sharedSecret = x25519.getSharedSecret(privateKey, peerPublicKey);
  
  // Derive encryption key using HKDF-SHA256
  const salt = new Uint8Array(32); // Zero salt for simplicity
  const info = new TextEncoder().encode('SecureChat-v1-Encryption');
  
  // Convert to standard Uint8Array to avoid type issues
  const secretBytes = new Uint8Array(sharedSecret);
  
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    'HKDF',
    false,
    ['deriveBits']
  );
  
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info
    },
    key,
    256 // 32 bytes for AES-256
  );
  
  return new Uint8Array(derivedBits);
}

interface EncryptedMessage {
  ciphertext: string;
  iv: string;
  sequence: number;
  timestamp: number;
}

// Encrypt message using shared secret with AEAD (AES-GCM)
export async function encryptMessage(
  message: string, 
  sharedSecret: Uint8Array,
  sequence: number
): Promise<string> {
  const encoder = new TextEncoder();
  
  // Create authenticated payload with sequence number and timestamp
  const timestamp = Date.now();
  const payload = JSON.stringify({
    text: message,
    sequence,
    timestamp
  });
  
  const data = encoder.encode(payload);
  
  // Import key for AES-GCM (cast to fix TypeScript strictness)
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret as any,
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  // Generate random IV (96 bits for AES-GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt with AEAD (provides both confidentiality and authenticity)
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine everything into a transportable format
  const result: EncryptedMessage = {
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
    iv: btoa(String.fromCharCode(...iv)),
    sequence,
    timestamp
  };
  
  return JSON.stringify(result);
}

// Decrypt message using shared secret and verify authenticity
export async function decryptMessage(
  encryptedMessage: string, 
  sharedSecret: Uint8Array,
  expectedSequence?: number
): Promise<{ text: string; sequence: number; timestamp: number }> {
  const parsed: EncryptedMessage = JSON.parse(encryptedMessage);
  
  // Convert from base64
  const ciphertext = Uint8Array.from(atob(parsed.ciphertext), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(parsed.iv), c => c.charCodeAt(0));
  
  // Import key for AES-GCM (cast to fix TypeScript strictness)
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret as any,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  // Decrypt and verify authenticity (AES-GCM will throw if tampered)
  let decrypted: ArrayBuffer;
  try {
    decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext as any
    );
  } catch (error) {
    throw new Error('Message authentication failed - possible tampering detected');
  }
  
  const decoder = new TextDecoder();
  const payload = JSON.parse(decoder.decode(decrypted));
  
  // Verify sequence number to prevent replay attacks
  if (expectedSequence !== undefined && payload.sequence !== expectedSequence) {
    throw new Error('Invalid sequence number - possible replay attack');
  }
  
  // Check timestamp freshness (reject messages older than 5 minutes)
  const age = Date.now() - payload.timestamp;
  if (age > 5 * 60 * 1000) {
    throw new Error('Message too old - possible replay attack');
  }
  
  return {
    text: payload.text,
    sequence: payload.sequence,
    timestamp: payload.timestamp
  };
}

// Export public key as base64 for sharing
export function publicKeyToBase64(publicKey: Uint8Array): string {
  return btoa(String.fromCharCode(...publicKey));
}

// Import public key from base64
export function base64ToPublicKey(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
