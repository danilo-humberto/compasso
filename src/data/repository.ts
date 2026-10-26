import { supabase } from "./client";
import type { Json } from "./database.types";
import { decodeSnapshot } from "./decode";
import type { Repository } from "./port";
const json = (value: unknown): Json =>
  JSON.parse(JSON.stringify(value)) as Json;
export const repository: Repository = {
  async deleteSchedule(id, revision) {
    if (!supabase) throw new Error("Configure o Supabase.");
    const { error } = await supabase.rpc("delete_schedule", {
      schedule_id: id,
      expected_revision: revision,
    });
    if (error) throw new Error(error.message);
  },
  async load() {
    if (!supabase) throw new Error("Configure o Supabase.");
    const { data, error } = await supabase.rpc("read_snapshot");
    if (error) throw new Error(error.message);
    return decodeSnapshot(data);
  },
  async importRecords(records, revision) {
    if (!supabase) throw new Error("Configure o Supabase.");
    const { error } = await supabase.rpc("import_records", {
      incoming: json(records),
      expected_revision: revision,
    });
    if (error) throw new Error(error.message);
  },
  async saveSchedule(schedule, revision) {
    if (!supabase) throw new Error("Configure o Supabase.");
    const { error } = await supabase.rpc("save_schedule", {
      item: json(schedule),
      expected_revision: revision,
    });
    if (error) throw new Error(error.message);
  },
};
