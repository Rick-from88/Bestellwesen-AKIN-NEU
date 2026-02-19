// Simple seed script: creates 5 'offen' bestellungen via the app API
// Usage: node scripts/seed-five-orders.js

// use global fetch (Node 18+). No external dependency required.

async function createOrder(payload) {
  const res = await fetch("http://localhost:3000/api/bestellungen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Failed to create order: ${txt}`);
  }
  return res.json();
}

async function main() {
  const sampleOrders = [];
  for (let i = 1; i <= 5; i++) {
    sampleOrders.push({
      status: "offen",
      bestellDatum: new Date().toISOString(),
      positionen: [
        { lieferantId: 1, artikelId: 1, menge: i },
        { lieferantId: 1, artikelId: 2, menge: 2 },
      ],
    });
  }

  for (const o of sampleOrders) {
    try {
      const created = await createOrder(o);
      console.log(
        "Created order",
        created.id || created.bestellnummer || created,
      );
    } catch (err) {
      console.error("Error creating order:", err.message);
      process.exitCode = 1;
      return;
    }
  }
  console.log("Done. Created 5 orders.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
