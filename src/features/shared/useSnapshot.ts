import { useCallback, useEffect, useState } from "react";
import type { Repository } from "../../data/port";
import type { Snapshot } from "../../domain/types";
export function useSnapshot(repository: Repository) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setSnapshot(await repository.load());
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível carregar a base.",
      );
    } finally {
      setLoading(false);
    }
  }, [repository]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { snapshot, error, loading, reload };
}
