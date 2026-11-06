import { createClient } from '@supabase/supabase-js'

// The publishable key is meant to ship to browsers. Row-level security on the
// favorites table is what keeps each user's saved cities private.
export const supabase = createClient(
  'https://ubxfnxeostkiysctpimr.supabase.co',
  'sb_publishable_IMFTkExJLmBPOrnv8b4xlA_yw03sSqv',
)
