import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const id = (value) => `00000000-0000-0000-0000-${String(value).padStart(12, "0")}`;

test("人力掌握以獨立版本發布且不改動人資主檔", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$
        select nullif(current_setting('test.uid', true), '')::uuid
      $$;
      create table public.stores (
        id uuid primary key,
        store_code text unique not null,
        name text not null,
        is_active boolean not null default true
      );
      create table public.profiles (
        id uuid primary key,
        full_name text not null,
        role text not null,
        store_id uuid references public.stores(id),
        is_active boolean not null default true
      );
      create table public.staff_roster (
        id uuid primary key,
        employee_name text not null,
        store_id uuid references public.stores(id)
      );
      insert into public.stores values
        ('${id(1)}', 'S01', '鳳山五甲店', true),
        ('${id(2)}', 'S02', '鳳山凱旋店', true);
      insert into public.profiles values
        ('${id(10)}', '營運長', 'coo', null, true),
        ('${id(11)}', '五甲店長', 'store_manager', '${id(1)}', true),
        ('${id(12)}', '凱旋店長', 'store_manager', '${id(2)}', true),
        ('${id(13)}', '督導', 'supervisor', null, true),
        ('${id(14)}', '外部帳號', 'external', null, true);
      insert into public.staff_roster values ('${id(20)}', '既有人資資料', '${id(1)}');
    `);
    const migration = await readFile(new URL("../supabase/migrations/20260927093000_staffing_overview.sql", import.meta.url), "utf8");
    await db.exec(migration);

    const user = (value) => db.query("select set_config('test.uid', $1, false)", [value ? id(value) : ""]);
    const call = async (action, payload = {}) => (await db.query(
      "select public.ops_staffing_display_api($1, $2) result",
      [action, JSON.stringify(payload)],
    )).rows[0].result;
    const content = {
      schema_version: 1,
      store_code: "S01",
      store_name: "鳳山五甲店",
      target_headcount: 8,
      daily_demand: 6,
      manager_name: "五甲店長",
      manager_authority: "正式店長",
      note: "五甲分為門店與後勤兩組。",
      people: [{ id: "p1", name: "既有人資資料", role: "正式人員", group: "門店", status: "在職", visible: true }],
    };

    await user(10);
    assert.equal((await call("read", { store_code: "S01" })).record, null);
    const savePayload = { store_code: "S01", expected_version: 0, command_id: id(100), reason: "建立展示版本", content };
    const saved = await call("save_draft", savePayload);
    assert.equal(saved.record.version, 1);
    assert.deepEqual(await call("save_draft", savePayload), saved);
    await assert.rejects(call("save_draft", { ...savePayload, reason: "重複編號改內容" }), /staffing_command_reused/);
    await assert.rejects(call("save_draft", { ...savePayload, command_id: id(101), expected_version: 0 }), /staffing_stale_version/);

    const published = await call("publish", { store_code: "S01", expected_version: 1, command_id: id(102), reason: "確認後發布" });
    assert.equal(published.record.version, 2);
    assert.equal(published.record.published_version, 1);
    assert.equal(published.record.published_content.store_name, "鳳山五甲店");

    await user(11);
    const storeView = await call("read", { store_code: "S01" });
    assert.equal(storeView.record.published_content.store_code, "S01");
    assert.equal("draft_content" in storeView.record, false);
    assert.deepEqual(storeView.events, []);
    await assert.rejects(call("read", { store_code: "S02" }), /staffing_forbidden/);
    await assert.rejects(call("save_draft", { ...savePayload, command_id: id(103), expected_version: 2 }), /staffing_forbidden/);

    await user(13);
    assert.equal((await call("read", { store_code: "S01" })).record.published_version, 1);
    await assert.rejects(call("save_draft", { ...savePayload, command_id: id(104), expected_version: 2 }), /staffing_forbidden/);

    await user(14);
    await assert.rejects(call("read", { store_code: "S01" }), /staffing_forbidden/);

    const hrRows = (await db.query("select employee_name from public.staff_roster order by employee_name")).rows;
    assert.deepEqual(hrRows, [{ employee_name: "既有人資資料" }]);
    assert.equal((await db.query("select count(*)::integer count from ops_staffing_private.events")).rows[0].count, 2);
  } finally {
    await db.close();
  }
});
