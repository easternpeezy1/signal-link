import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Button } from './ui/button';
import { ScrollArea } from './ui/scroll-area';
import { Avatar, AvatarFallback } from './ui/avatar';
import { MessageSquare, Users } from 'lucide-react';

interface Profile {
  id: string;
  user_id: string;
  username: string;
  online_status: boolean;
  public_key?: string;
}

interface UserListProps {
  onSelectUser: (userId: string, username: string, publicKey: string) => void;
}

export default function UserList({ onSelectUser }: UserListProps) {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);

  useEffect(() => {
    if (!user) return;

    const fetchProfiles = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('online_status', true)
        .neq('user_id', user.id);

      if (!error && data) {
        setProfiles(data);
      }
    };

    fetchProfiles();

    // Subscribe to profile changes
    const channel = supabase
      .channel('profiles-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        () => {
          fetchProfiles();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  return (
    <div className="flex flex-col h-full border-r border-border bg-card">
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>{profiles.length} online</span>
        </div>
      </div>
      
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {profiles.length === 0 ? (
            <div className="text-center py-8 px-4 space-y-2">
              <p className="text-muted-foreground text-sm">No other users online</p>
              <p className="text-xs text-muted-foreground">
                Open an incognito window and sign up with another account to test P2P messaging
              </p>
            </div>
          ) : (
            profiles.map((profile) => (
              <Button
                key={profile.id}
                variant="ghost"
                className="w-full justify-start gap-3 h-auto py-3"
                onClick={() => onSelectUser(profile.user_id, profile.username, profile.public_key || '')}
              >
                <Avatar className="h-10 w-10">
                  <AvatarFallback className="bg-primary/10 text-primary">
                    {profile.username.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 text-left">
                  <div className="font-medium">{profile.username}</div>
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <span className="status-indicator status-online"></span>
                    Online
                  </div>
                </div>
                <MessageSquare className="h-4 w-4 text-muted-foreground" />
              </Button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
