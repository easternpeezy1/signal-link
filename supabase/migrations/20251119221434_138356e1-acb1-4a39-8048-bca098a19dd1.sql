-- Add public_key column to profiles table for E2E encryption
ALTER TABLE public.profiles 
ADD COLUMN public_key TEXT;

-- Create index for faster lookups
CREATE INDEX idx_profiles_public_key ON public.profiles(public_key);

-- Update RLS policies to allow users to read other users' public keys (needed for encryption)
-- but not modify them
CREATE POLICY "Public keys are readable by authenticated users"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- Ensure users can update their own public key
CREATE POLICY "Users can update own public key"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);