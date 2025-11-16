import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Shield, LogOut, Users, Lock } from 'lucide-react';
import { generateKeyPair, storeKeys, getKeys, publicKeyToBase64 } from '@/lib/crypto';
import { toast } from 'sonner';

export default function Chat() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [keysReady, setKeysReady] = useState(false);
  const [publicKey, setPublicKey] = useState<string>('');

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
      setPublicKey(publicKeyToBase64(newKeys.publicKey));
      toast.success('Encryption keys generated locally');
    } else {
      setPublicKey(publicKeyToBase64(keys.publicKey));
    }
    
    setKeysReady(true);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
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
    <div className="min-h-screen bg-background">
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

      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="bg-card border border-border rounded-lg p-8 text-center space-y-6">
          <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
            <Users className="h-8 w-8 text-primary" />
          </div>
          
          <div className="space-y-2">
            <h2 className="text-2xl font-semibold">P2P Encrypted Messenger</h2>
            <p className="text-muted-foreground">
              Your encryption keys are ready. Chat interface coming soon!
            </p>
          </div>

          <div className="bg-muted/50 rounded-lg p-4 text-left space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Status:</span>
              <span className="flex items-center gap-2 text-sm text-success">
                <span className="status-indicator status-online"></span>
                Online & Encrypted
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Your Public Key:</span>
              <code className="text-xs bg-background px-2 py-1 rounded">
                {publicKey.substring(0, 16)}...
              </code>
            </div>
          </div>

          <div className="text-sm text-muted-foreground space-y-2">
            <p className="flex items-center gap-2 justify-center">
              <Lock className="h-4 w-4" />
              Zero-knowledge architecture - messages never stored on servers
            </p>
            <p className="flex items-center gap-2 justify-center">
              <Shield className="h-4 w-4" />
              End-to-end encryption with keys stored only on your device
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}