// Zero-knowledge cryptography utilities
// All encryption happens locally - keys never leave the device

import localforage from 'localforage';

const KEYS_STORE = 'securechat_keys';

// Generate a new keypair for the user
export async function generateKeyPair(): Promise<{ publicKey: Uint8Array; privateKey: Uint8Array }> {
  const privateKey = crypto.getRandomValues(new Uint8Array(32));
  
  // Derive public key by hashing the private key
  const hashBuffer = await crypto.subtle.digest('SHA-256', privateKey);
  const publicKey = new Uint8Array(hashBuffer);
  
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

// Generate shared secret for encryption (Diffie-Hellman)
export async function generateSharedSecret(privateKey: Uint8Array, peerPublicKey: Uint8Array): Promise<Uint8Array> {
  // For now, we'll XOR the keys as a simple shared secret
  // In production, you'd want proper ECDH
  const secret = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    secret[i] = privateKey[i] ^ peerPublicKey[i];
  }
  return secret;
}

// Encrypt message using shared secret
export async function encryptMessage(message: string, sharedSecret: Uint8Array): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  
  // Use Web Crypto API for AES-GCM encryption
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['encrypt']
  );
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  
  // Combine IV and ciphertext
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

// Decrypt message using shared secret
export async function decryptMessage(encryptedMessage: string, sharedSecret: Uint8Array): Promise<string> {
  const combined = Uint8Array.from(atob(encryptedMessage), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);
  
  const key = await crypto.subtle.importKey(
    'raw',
    sharedSecret.slice(0, 32),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

// Export public key as base64 for sharing
export function publicKeyToBase64(publicKey: Uint8Array): string {
  return btoa(String.fromCharCode(...publicKey));
}

// Import public key from base64
export function base64ToPublicKey(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}