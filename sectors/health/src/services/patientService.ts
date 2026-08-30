import { supabase } from "../lib/supabase"

export async function getPatients() {
  const { data, error } = await supabase
    .from("patients")
    .select("*")

  if (error) {
    throw error
  }

  return data
}