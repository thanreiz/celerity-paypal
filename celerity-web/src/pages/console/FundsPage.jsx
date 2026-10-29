import React, { useState } from "react";
import Card from "../../design/Card";
import Button from "../../design/Button";
import Input from "../../design/Input";
import { api } from "../../lib/api";
import { PoolList } from "../public/Pools";
import { PageHeader } from "./parts";

function NewPool({ act, onDone }) {
  const [name, setName] = useState("");
  const [funder, setFunder] = useState("");
  const [provinces, setProvinces] = useState("");
  const list = provinces
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <Card title="Open a funding pool">
      <form
        className="cel-stack"
        style={{ gap: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          act("Pool opened.", () => api.createPool({ name, funder, provinces: list })).then(onDone, () => {});
        }}
      >
        <Input label="Pool name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} placeholder="e.g. Sorsogon rice farmers typhoon fund" />
        <Input label="Funder" value={funder} onChange={(e) => setFunder(e.target.value)} required maxLength={80} placeholder="e.g. Sorsogon Farmers Co-op" />
        <Input
          label="Provinces"
          value={provinces}
          onChange={(e) => setProvinces(e.target.value)}
          placeholder="Sorsogon, Albay"
          hint={list.length ? `Earmarked for ${list.join(", ")}` : "Separate with commas. Leave empty for a nationwide pool."}
        />
        <div className="cel-row-actions">
          <Button type="submit" variant="outline" disabled={!name.trim() || !funder.trim()}>
            Open pool
          </Button>
          <Button variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}

export default function FundsPage({ data, config, act }) {
  const [adding, setAdding] = useState(false);
  return (
    <main className="cel-page cel-page--wide">
      <PageHeader
        title="Funds"
        lede="Funders put money into pools earmarked for an area through PayPal. Every approved payout is split across the pools that cover the family, pro-rata by what each has left."
      >
        {!adding && (
          <Button variant="outline" onClick={() => setAdding(true)}>
            + Open a pool
          </Button>
        )}
      </PageHeader>
      {adding && <NewPool act={act} onDone={() => setAdding(false)} />}
      <PoolList pools={data.pools} currency={config.policy.currency} />
    </main>
  );
}
