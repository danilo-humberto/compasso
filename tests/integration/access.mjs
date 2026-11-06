// Exclusivamente PostgreSQL descartável local. Nunca aceita URL externa.
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
const config = {
  host: "127.0.0.1",
  port: 55439,
  user: "postgres",
  password: "synthetic-test-only",
  database: "postgres",
};
const bootstrap = new pg.Client(config);
await bootstrap.connect();
await bootstrap.query(
  "DROP DATABASE IF EXISTS compasso_access_test WITH (FORCE)",
);
await bootstrap.query("CREATE DATABASE compasso_access_test");
await bootstrap.end();
const db = new pg.Client({ ...config, database: "compasso_access_test" });
await db.connect();
const manager = "11111111-1111-4111-8111-111111111111";
const legacy = "22222222-2222-4222-8222-222222222222";
const reader = "33333333-3333-4333-8333-333333333333";
const pending = "44444444-4444-4444-8444-444444444444";
const withoutEmail = "66666666-6666-4666-8666-666666666666";
const migrationDir = new URL("../../supabase/migrations/", import.meta.url);
const roleSql = readFileSync(
  new URL("202611060001_user_access.sql", migrationDir),
  "utf8",
);
const login = async (id) => {
  await db.query("RESET ROLE");
  await db.query("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [id]);
};
const access = async () =>
  (await db.query("SELECT public.get_my_access() AS data")).rows[0].data;
const snapshot = async () =>
  (await db.query("SELECT public.read_snapshot() AS data")).rows[0].data;
const denied = (sql, args = []) =>
  assert.rejects(db.query(sql, args), (error) => error.code === "42501");
let passed = 0;
const check = async (label, fn) => {
  await fn();
  passed++;
  console.log(`PASS ${label}`);
};
const record = {
  employeeId: "001",
  name: "Sintético",
  contract: "Teste",
  date: "2026-11-06",
  punchedDate: "2026-11-06",
  sourceSchedule: "",
  punches: [null, null, null, null],
};
const schedule = {
  id: "55555555-5555-4555-8555-555555555555",
  label: "Teste",
  target: "contract",
  targetId: "Teste",
  week: Array.from({ length: 7 }, () => []),
};
try {
  await db.query(`DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    GRANT USAGE ON SCHEMA auth TO anon,authenticated;
    GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated;`);
  for (const file of readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql") && file < "202611060001")
    .sort()) {
    await db.query(readFileSync(new URL(file, migrationDir), "utf8"));
  }
  await db.query(
    "INSERT INTO auth.users VALUES ($1,'existing@example.test','{}')",
    [legacy],
  );
  await db.query("INSERT INTO auth.users VALUES ($1,null,'{}')", [
    withoutEmail,
  ]);
  await check(
    "migration aborta integralmente sem conta responsável",
    async () => {
      await assert.rejects(db.query(roleSql), /conta responsável/);
      await db.query("ROLLBACK");
      assert.equal(
        (await db.query("SELECT to_regclass('public.user_access') AS name"))
          .rows[0].name,
        null,
      );
    },
  );
  await db.query(
    "INSERT INTO auth.users VALUES ($1,'danilohumberto@cifraengenharia.com.br','{}')",
    [manager],
  );
  await db.query(roleSql);
  for (const file of readdirSync(migrationDir)
    .filter(
      (file) => file.endsWith(".sql") && file > "202611060001_user_access.sql",
    )
    .sort()) {
    await db.query(readFileSync(new URL(file, migrationDir), "utf8"));
  }
  await check(
    "usuários existentes permanecem admin e somente responsável gerencia",
    async () => {
      await login(legacy);
      assert.deepEqual(await access(), {
        role: "admin",
        canManageUsers: false,
      });
      await denied("SELECT public.list_app_users()");
      await login(withoutEmail);
      assert.deepEqual(await access(), {
        role: "admin",
        canManageUsers: false,
      });
      await login(manager);
      assert.deepEqual(await access(), { role: "admin", canManageUsers: true });
      assert.equal(
        (await db.query("SELECT public.list_app_users() AS data")).rows[0].data
          .length,
        3,
      );
    },
  );
  await db.query("RESET ROLE");
  await db.query(
    "INSERT INTO auth.users VALUES ($1,'reader@example.test','{\"role\":\"admin\",\"canManageUsers\":true}'),($2,'pending@example.test','{}')",
    [reader, pending],
  );
  await check(
    "conta nova não herda permissão de metadados nem lê dados",
    async () => {
      await login(reader);
      assert.equal(await access(), null);
      await denied("SELECT public.read_snapshot()");
      await denied("SELECT public.reset_base(0)");
    },
  );
  await check(
    "responsável atribui perfis e protege sua própria conta",
    async () => {
      await login(manager);
      await db.query("SELECT public.set_user_role($1,'reader')", [reader]);
      await assert.rejects(
        db.query("SELECT public.set_user_role($1,'reader')", [manager]),
        /responsável/,
      );
      await assert.rejects(
        db.query("SELECT public.set_user_role($1,'owner')", [reader]),
        /Perfil inválido/,
      );
      await assert.rejects(
        db.query("SELECT public.set_user_role($1,null)", [reader]),
        /Perfil inválido/,
      );
    },
  );
  await check("admin existente importa e gerencia jornadas", async () => {
    await login(legacy);
    await db.query("SELECT public.import_records_incremental($1,$2)", [
      JSON.stringify([record]),
      (await snapshot()).revision,
    ]);
    await db.query("SELECT public.save_schedule($1,$2)", [
      JSON.stringify(schedule),
      (await snapshot()).revision,
    ]);
    assert.equal((await snapshot()).imports.length, 1);
  });
  await check(
    "leitor consulta registros e jornadas para cálculo sem histórico administrativo",
    async () => {
      await login(reader);
      const data = await snapshot();
      assert.equal(data.records.length, 1);
      assert.equal(data.schedules.length, 1);
      assert.deepEqual(data.imports, []);
      assert.equal(
        (await db.query("SELECT * FROM public.time_records")).rowCount,
        1,
      );
      assert.equal(
        (await db.query("SELECT * FROM public.import_history")).rowCount,
        0,
      );
    },
  );
  await check(
    "leitor não escreve por RPC nem diretamente e não se promove",
    async () => {
      const before = await snapshot();
      await denied("SELECT public.import_records_incremental($1,$2)", [
        JSON.stringify([record]),
        before.revision,
      ]);
      await denied("SELECT public.save_schedule($1,$2)", [
        JSON.stringify(schedule),
        before.revision,
      ]);
      await denied("SELECT public.delete_schedule($1,$2)", [
        schedule.id,
        before.revision,
      ]);
      await denied("SELECT public.reset_base($1)", [before.revision]);
      await denied("SELECT public.list_app_users()");
      await denied("SELECT public.set_user_role($1,'admin')", [reader]);
      await denied(
        "UPDATE public.user_access SET role='admin' WHERE user_id=$1",
        [reader],
      );
      await denied("INSERT INTO public.user_access VALUES ($1,'admin',true)", [
        pending,
      ]);
      await denied("SELECT public.assert_app_access('admin')");
      for (const table of [
        "time_records",
        "schedules",
        "employees",
        "contracts",
        "import_history",
        "base_revision",
      ]) {
        await denied(`DELETE FROM public.${table}`);
      }
      assert.deepEqual(await snapshot(), before);
    },
  );
  await check(
    "admin comum não atribui perfis e convites repetidos não sobrescrevem acesso",
    async () => {
      await login(legacy);
      await denied("SELECT public.set_user_role($1,'admin')", [reader]);
      await login(manager);
      await db.query("SELECT public.set_user_role($1,'admin',true)", [reader]);
      await login(reader);
      assert.equal((await access()).role, "reader");
    },
  );
  await check(
    "somente responsável revoga acesso e preserva a própria conta",
    async () => {
      for (const id of [legacy, reader, pending]) {
        await login(id);
        await denied("SELECT public.revoke_user_access($1)", [reader]);
      }
      await db.query("RESET ROLE");
      await db.query("SET ROLE anon");
      await denied("SELECT public.revoke_user_access($1)", [reader]);
      await login(manager);
      await assert.rejects(
        db.query("SELECT public.revoke_user_access($1)", [manager]),
        /responsável/,
      );
      await assert.rejects(
        db.query("SELECT public.revoke_user_access(null)"),
        /Usuário não encontrado/,
      );
      assert.equal((await access()).canManageUsers, true);
    },
  );
  await check(
    "revogação bloqueia sessão existente e preserva conta e dados",
    async () => {
      await login(manager);
      const before = await snapshot();
      for (const id of [reader, legacy]) {
        await db.query("SELECT public.revoke_user_access($1)", [id]);
        await db.query("SELECT public.revoke_user_access($1)", [id]);
        await login(id);
        assert.equal(await access(), null);
        await denied("SELECT public.read_snapshot()");
        await denied("SELECT public.reset_base($1)", [before.revision]);
        await denied("SELECT public.set_user_role($1,'admin')", [id]);
        assert.equal(
          (await db.query("SELECT * FROM public.time_records")).rowCount,
          0,
        );
        await login(manager);
        const users = (await db.query("SELECT public.list_app_users() AS data"))
          .rows[0].data;
        assert.equal(users.find((user) => user.id === id).role, null);
        assert.deepEqual(await snapshot(), before);
        await db.query("SELECT public.set_user_role($1,$2)", [
          id,
          id === reader ? "reader" : "admin",
        ]);
      }
    },
  );
  await check(
    "troca de perfil vale na próxima chamada com a mesma sessão",
    async () => {
      await login(manager);
      await db.query("SELECT public.set_user_role($1,'reader')", [legacy]);
      await login(legacy);
      await denied("SELECT public.reset_base($1)", [
        (await snapshot()).revision,
      ]);
      await login(manager);
      await db.query("SELECT public.set_user_role($1,'admin')", [legacy]);
      await login(legacy);
      await db.query("SELECT public.delete_schedule($1,$2)", [
        schedule.id,
        (await snapshot()).revision,
      ]);
      await db.query("SELECT public.reset_base($1)", [
        (await snapshot()).revision,
      ]);
      assert.equal((await snapshot()).records.length, 0);
    },
  );
  await check(
    "sem perfil e anônimo não acessam consultas nem gestão",
    async () => {
      await login(pending);
      await denied("SELECT public.read_snapshot()");
      await denied("SELECT public.list_app_users()");
      assert.equal(
        (await db.query("SELECT * FROM public.schedules")).rowCount,
        0,
      );
      await db.query("RESET ROLE");
      await db.query("SET ROLE anon");
      for (const fn of [
        "get_my_access()",
        "list_app_users()",
        "read_snapshot()",
        "reset_base(4)",
      ])
        await denied(`SELECT public.${fn}`);
    },
  );
  await check(
    "exclusão da conta remove perfil e preserva dados e histórico do autor",
    async () => {
      await login(legacy);
      await db.query("SELECT public.import_records_incremental($1,$2)", [
        JSON.stringify([record]),
        (await snapshot()).revision,
      ]);
      await login(manager);
      const before = await snapshot();
      await db.query("SELECT public.revoke_user_access($1)", [legacy]);
      await db.query("RESET ROLE");
      // Simula a remoção do registro Auth: a API administrativa é testada separadamente.
      await db.query("DELETE FROM auth.users WHERE id=$1", [legacy]);
      assert.equal(
        (
          await db.query("SELECT * FROM public.user_access WHERE user_id=$1", [
            legacy,
          ])
        ).rowCount,
        0,
      );
      await login(manager);
      const after = await snapshot();
      assert.deepEqual(after.records, before.records);
      assert.deepEqual(after.schedules, before.schedules);
      assert.equal(after.revision, before.revision);
      assert.deepEqual(
        after.imports.map((entry) => ({ ...entry, actorName: null })),
        before.imports.map((entry) => ({ ...entry, actorName: null })),
      );
      assert.ok(
        after.imports.some(
          (entry) =>
            entry.actor === legacy &&
            entry.actorName === "Usuário indisponível",
        ),
      );
      const users = (await db.query("SELECT public.list_app_users() AS data"))
        .rows[0].data;
      assert.equal(
        users.some((user) => user.id === legacy),
        false,
      );
      await login(legacy);
      assert.equal(await access(), null);
      await denied("SELECT public.read_snapshot()");
    },
  );
  console.log(
    `${passed} verificações de acesso aprovadas em PostgreSQL descartável.`,
  );
} finally {
  await db.end();
}
