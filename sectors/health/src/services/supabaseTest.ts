import { supabase } from "../lib/supabase";

export async function testSupabase(){

 const {data,error}= await supabase
 .from("patients")
 .select("*")
 .limit(5)

 console.log("DATA:",data)
 console.log("ERROR:",error)

}