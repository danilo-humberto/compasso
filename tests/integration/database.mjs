// Executa SOMENTE no PostgreSQL descartável autorizado, ligado a 127.0.0.1:55439.
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const config = {
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  password: "synthetic-test-only",
  database: "postgres",
};
const admin = new pg.Client(config);
await admin.connect();
// Banco exclusivo dos testes; nunca recebe URL ou credenciais externas.
await admin.query("DROP DATABASE IF EXISTS compasso_test WITH (FORCE)");
await admin.query("CREATE DATABASE compasso_test");
await admin.end();
const db = new pg.Client({ ...config, database: "compasso_test" });
await db.connect();
await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
 DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
 CREATE SCHEMA auth;
 CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO anon,authenticated;
 GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
await db.query(
  readFileSync(
    new URL(
      "../../supabase/migrations/202610230001_initial.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
const uid = "11111111-1111-4111-8111-111111111111";
await db.query(
  readFileSync(
    new URL(
      "../../supabase/migrations/202610230002_replace_only.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.query(
  readFileSync(
    new URL(
      "../../supabase/migrations/202610260001_delete_schedule.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.query(
  readFileSync(
    new URL(
      "../../supabase/migrations/202610260002_import_actor_name.sql",
      import.meta.url,
    ),
    "utf8",
  ),
);
await db.query("INSERT INTO auth.users VALUES ($1,$2,$3::jsonb)", [
  uid,
  "pessoa@example.test",
  JSON.stringify({ full_name: "Pessoa Teste" }),
]);
const noValiditySql = readFileSync(
  new URL(
    "../../supabase/migrations/202610260003_schedules_without_validity.sql",
    import.meta.url,
  ),
  "utf8",
);
const legacySchedule = {
  id: "77777777-7777-4777-8777-777777777777",
  label: "Legado",
  target: "contract",
  targetId: "legado",
  from: "2026-01-01",
  to: "2026-01-31",
  week: Array.from({ length: 7 }, () => []),
};
await db.query(
  "INSERT INTO public.schedules VALUES ($1,'contract','legado','2026-01-01','2026-01-31',$2::jsonb), ($3,'contract','legado','2026-02-01',null,$4::jsonb)",
  [
    legacySchedule.id,
    JSON.stringify(legacySchedule),
    "88888888-8888-4888-8888-888888888888",
    JSON.stringify({
      ...legacySchedule,
      id: "88888888-8888-4888-8888-888888888888",
      from: "2026-02-01",
      to: null,
    }),
  ],
);
await assert.rejects(db.query(noValiditySql), /várias jornadas/);
await db.query("ROLLBACK");
assert.equal(
  (await db.query("SELECT count(*)::int AS n FROM public.schedules")).rows[0].n,
  2,
);
assert.equal(
  (
    await db.query("SELECT payload FROM public.schedules WHERE id=$1", [
      legacySchedule.id,
    ])
  ).rows[0].payload.from,
  "2026-01-01",
);
await db.query("DELETE FROM public.schedules WHERE id=$1", [
  "88888888-8888-4888-8888-888888888888",
]);
await db.query(noValiditySql);
const migrated = (await db.query("SELECT payload FROM public.schedules"))
  .rows[0].payload;
const expectedSchedule = { ...legacySchedule };
delete expectedSchedule.from;
delete expectedSchedule.to;
assert.deepEqual(migrated, expectedSchedule);
assert.equal(
  (await db.query("SELECT revision::int FROM public.base_revision")).rows[0]
    .revision,
  1,
);
await db.query("DELETE FROM public.schedules");
console.log(
  "PASS migration aborta duplicidades sem perda e preserva jornada ao remover datas",
);
// A migration incrementa a revisão; reinicia apenas a base sintética vazia desta suíte.
await db.query("UPDATE public.base_revision SET revision=0");
const record = {
  employeeId: "001",
  name: "Pessoa sintética",
  contract: "Contrato teste",
  date: "2026-08-03",
  punchedDate: "2026-08-03",
  sourceSchedule: "Sintética",
  punches: ["08:00", "12:00", "13:00", "17:00"].map((t) => ({
    at: `2026-08-03T${t}`,
    marked: false,
  })),
};
const schedule = {
  id: "22222222-2222-4222-8222-222222222222",
  label: "Comercial",
  target: "contract",
  targetId: "Contrato teste",

  week: Array.from({ length: 7 }, () => [
    { start: "08:00", end: "12:00" },
    { start: "13:00", end: "17:00" },
  ]),
};
let passed = 0;
async function check(name, fn) {
  await fn();
  passed++;
  console.log(`PASS ${name}`);
}
const login = async (client) => {
  await client.query("SET ROLE authenticated");
  await client.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [
    uid,
  ]);
};
const snapshot = async () =>
  (await db.query("SELECT public.read_snapshot() AS data")).rows[0].data;
const importRows = async (rows, rev) =>
  db.query("SELECT public.import_records($1::jsonb,$2)", [
    JSON.stringify(rows),
    rev,
  ]);
try {
  await check("RPC antiga com escolha de modo foi removida", async () => {
    const result = await db.query(
      "SELECT to_regprocedure('public.import_records(jsonb,text,bigint)') AS legacy",
    );
    assert.equal(result.rows[0].legacy, null);
  });
  await check("anônimo não lê nem importa", async () => {
    await db.query("SET ROLE anon");
    await assert.rejects(
      db.query("SELECT public.read_snapshot()"),
      /permission denied/,
    );
    await assert.rejects(importRows([record], 0), /permission denied/);
    await assert.rejects(
      db.query("SELECT * FROM public.time_records"),
      /permission denied/,
    );
    await db.query("RESET ROLE");
  });
  await login(db);
  await check("usuário autenticado importa e lê", async () => {
    await importRows([record], 0);
    assert.equal((await snapshot()).records.length, 1);
  });
  await check("reimportação não duplica nem conta atualização", async () => {
    await importRows([record], 1);
    const s = await snapshot();
    assert.equal(s.records.length, 1);
    assert.equal(s.imports[0].updated, 0);
  });
  await check("conflito de revisão preserva base", async () => {
    await assert.rejects(
      importRows([{ ...record, name: "Outro" }], 1),
      /base mudou/,
    );
    assert.equal((await snapshot()).records[0].name, record.name);
  });
  await check("substituição inválida é atômica", async () => {
    await assert.rejects(importRows([{ ...record, date: "2026-02-31" }], 2));
    assert.equal((await snapshot()).records.length, 1);
    assert.equal((await snapshot()).revision, 2);
  });
  await check("não armazena campos extras como CPF", async () => {
    await assert.rejects(
      importRows([{ ...record, cpf: "synthetic" }], 2),
      /não permitidos/,
    );
  });
  await check("não permite gravação direta fora das RPCs", async () => {
    await assert.rejects(
      db.query("DELETE FROM public.time_records"),
      /permission denied/,
    );
  });
  await check("atualiza linha existente", async () => {
    await importRows([{ ...record, name: "Nome atualizado" }], 2);
    const s = await snapshot();
    assert.equal(s.records.length, 1);
    assert.equal(s.records[0].name, "Nome atualizado");
    assert.equal(s.imports[0].updated, 1);
  });
  await check(
    "salva jornada sem datas e bloqueia destino duplicado",
    async () => {
      await db.query("SELECT public.save_schedule($1,3)", [
        JSON.stringify(schedule),
      ]);
      await assert.rejects(
        db.query("SELECT public.save_schedule($1,4)", [
          JSON.stringify({
            ...schedule,
            id: "33333333-3333-4333-8333-333333333333",
          }),
        ]),
        /destino/,
      );
    },
  );
  await check("rejeita períodos noturnos sobrepostos", async () => {
    await assert.rejects(
      db.query("SELECT public.save_schedule($1,4)", [
        JSON.stringify({
          ...schedule,
          week: Array.from({ length: 7 }, () => [
            { start: "22:00", end: "06:00" },
            { start: "02:00", end: "03:00" },
          ]),
        }),
      ]),
      /sobrepostos/,
    );
    assert.equal((await snapshot()).revision, 4);
  });
  await check("substituição preserva jornadas e histórico", async () => {
    await importRows([{ ...record, date: "2026-08-04" }], 4);
    const s = await snapshot();
    assert.equal(s.records.length, 1);
    assert.equal(s.records[0].date, "2026-08-04");
    assert.equal(s.schedules.length, 1);
    assert.equal(s.imports[0].removed, 1);
  });
  await check(
    "duas importações concorrentes: uma grava e outra pede nova prévia",
    async () => {
      const other = new pg.Client({ ...config, database: "compasso_test" });
      await other.connect();
      try {
        await login(other);
        const results = await Promise.allSettled([
          importRows([record], 5),
          other.query("SELECT public.import_records($1,$2)", [
            JSON.stringify([record]),
            5,
          ]),
        ]);
        assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
        assert.equal(results.filter((r) => r.status === "rejected").length, 1);
        assert.equal((await snapshot()).revision, 6);
      } finally {
        await other.end();
      }
    },
  );
  await check(
    "falha na limpeza desfaz a nova gravação e preserva a base anterior",
    async () => {
      const before = await snapshot();
      await db.query("RESET ROLE");
      await db.query(`CREATE FUNCTION public.test_cleanup_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NOT EXISTS(SELECT 1 FROM public.time_records WHERE employee_id='new-employee') THEN RAISE EXCEPTION 'Remoção ocorreu antes da nova gravação'; END IF;
      RAISE EXCEPTION 'Falha simulada na limpeza';
    END $$;
    CREATE TRIGGER test_cleanup_failure BEFORE DELETE ON public.time_records FOR EACH ROW EXECUTE FUNCTION public.test_cleanup_failure();`);
      await login(db);
      await assert.rejects(
        importRows(
          [
            {
              ...record,
              employeeId: "new-employee",
              contract: "Novo contrato",
            },
          ],
          before.revision,
        ),
        /Falha simulada na limpeza/,
      );
      assert.deepEqual(await snapshot(), before);
      await db.query("RESET ROLE");
      await db.query(
        "DROP TRIGGER test_cleanup_failure ON public.time_records; DROP FUNCTION public.test_cleanup_failure();",
      );
      await login(db);
    },
  );
  await check(
    "a nova base é exata e remove cadastros exclusivos da anterior",
    async () => {
      const before = await snapshot();
      const replacement = [
        { ...record, employeeId: "new-employee", contract: "Novo contrato" },
      ];
      await importRows(replacement, before.revision);
      const after = await snapshot();
      assert.deepEqual(after.records, replacement);
      assert.deepEqual(after.schedules, before.schedules);
      assert.equal(after.imports.length, before.imports.length + 1);
      assert.deepEqual(
        (await db.query("SELECT id FROM public.employees")).rows,
        [{ id: "new-employee" }],
      );
      assert.deepEqual(
        (await db.query("SELECT id FROM public.contracts")).rows,
        [{ id: "Novo contrato" }],
      );
    },
  );
  await check(
    "exclusão exige autenticação, revisão atual e jornada existente",
    async () => {
      const before = await snapshot();
      assert.ok(before.schedules.length > 0);
      const id = before.schedules[0].id;
      await db.query("RESET ROLE");
      await db.query("SET ROLE anon");
      await assert.rejects(
        db.query("SELECT public.delete_schedule($1,$2)", [id, before.revision]),
        /permission denied/,
      );
      await login(db);
      await db.query("SELECT set_config('request.jwt.claim.sub','',false)");
      await assert.rejects(
        db.query("SELECT public.delete_schedule($1,$2)", [id, before.revision]),
        /Acesso não autorizado/,
      );
      await login(db);
      await assert.rejects(
        db.query("SELECT public.delete_schedule($1,$2)", [
          id,
          before.revision - 1,
        ]),
        /A base mudou/,
      );
      await assert.rejects(
        db.query("SELECT public.delete_schedule($1,$2)", [
          "99999999-9999-4999-8999-999999999999",
          before.revision,
        ]),
        /Jornada não encontrada/,
      );
      assert.deepEqual(await snapshot(), before);
      await db.query("SELECT public.delete_schedule($1,$2)", [
        id,
        before.revision,
      ]);
      const after = await snapshot();
      assert.equal(after.revision, before.revision + 1);
      assert.deepEqual(
        after.schedules,
        before.schedules.filter((s) => s.id !== id),
      );
      assert.deepEqual(after.records, before.records);
      assert.deepEqual(after.imports, before.imports);
    },
  );
  await check(
    "histórico resolve nome, fallback e autor removido sem expor dados de autenticação",
    async () => {
      const before = await snapshot();
      assert.ok(before.imports.length > 0);
      assert.equal(before.imports[0].actorName, "Pessoa Teste");
      assert.equal(before.imports[0].actor, uid);
      await assert.rejects(
        db.query("SELECT * FROM auth.users"),
        /permission denied/,
      );
      await db.query("RESET ROLE");
      await db.query(
        "UPDATE auth.users SET raw_user_meta_data=$1::jsonb WHERE id=$2",
        [JSON.stringify({ full_name: " ", name: "Nome Alternativo" }), uid],
      );
      await login(db);
      assert.equal((await snapshot()).imports[0].actorName, "Nome Alternativo");
      await db.query("RESET ROLE");
      await db.query(
        "UPDATE auth.users SET raw_user_meta_data='{}'::jsonb WHERE id=$1",
        [uid],
      );
      await login(db);
      assert.equal((await snapshot()).imports[0].actorName, "pessoa");
      await db.query("RESET ROLE");
      await db.query("DELETE FROM auth.users WHERE id=$1", [uid]);
      await login(db);
      const after = await snapshot();
      assert.equal(after.imports[0].actorName, "Usuário indisponível");
      assert.equal(after.imports.length, before.imports.length);
      assert.equal(after.revision, before.revision);
      assert.ok(!JSON.stringify(after).includes("@example.test"));
    },
  );
  console.log(
    `${passed} verificações PostgreSQL aprovadas. Dados exclusivamente sintéticos.`,
  );
} finally {
  await db.end();
}
