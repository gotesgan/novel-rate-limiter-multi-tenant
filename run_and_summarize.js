const fs = require("fs");
const { execSync } = require("child_process");
const readline = require("readline");

const tests = [
  {
    name: "Token_Bucket",
    container: "k6_tb",
    script: "/scripts/test.js",
    out: "tb_results.json",
    summary: "tb_summary.json",
  },
  {
    name: "Custom_Algo",
    container: "k6_ca",
    script: "/scripts/test.js",
    out: "ca_results.json",
    summary: "ca_summary.json",
  },
];

async function summarizeK6(inputFile, outputFile) {
  const summary = {
    allowed_requests: { count: 0, perTenant: {} },
    blocked_requests: { count: 0 },
    http_req_duration: { samples: [], perTenant: {} },
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;

    let entry;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    if (entry.type !== "Point") continue;

    const metric = entry.metric;
    const value = entry.data.value;
    const tags = entry.data.tags || {};
    const tenant = tags.tenant || "default";

    if (metric === "allowed_requests") {
      summary.allowed_requests.count++;
      if (!summary.allowed_requests.perTenant[tenant]) {
        summary.allowed_requests.perTenant[tenant] = 0;
      }
      summary.allowed_requests.perTenant[tenant]++;
    }

    if (metric === "blocked_requests") {
      summary.blocked_requests.count++;
    }

    if (metric === "latency") {
      summary.http_req_duration.samples.push(value);

      if (!summary.http_req_duration.perTenant[tenant])
        summary.http_req_duration.perTenant[tenant] = { sum: 0, count: 0 };
      summary.http_req_duration.perTenant[tenant].sum += value;
      summary.http_req_duration.perTenant[tenant].count++;
    }
  }

  // finalize per-tenant
  for (const t of Object.keys(summary.http_req_duration.perTenant)) {
    const d = summary.http_req_duration.perTenant[t];
    summary.http_req_duration.perTenant[t] = { avg: d.sum / d.count };
  }

  fs.writeFileSync(outputFile, JSON.stringify(summary, null, 2));
  console.log(`✅ Summary written to ${outputFile}`);
}

function calculateFairnessIndex(summary) {
  const allowedPerTenant = summary.allowed_requests.perTenant;
  const tenants = Object.keys(allowedPerTenant);
  if (tenants.length === 0) {
    return 0;
  }

  let sum = 0;
  let sumOfSquares = 0;

  for (const tenant of tenants) {
    const x_i = allowedPerTenant[tenant];
    sum += x_i;
    sumOfSquares += x_i * x_i;
  }

  const n = tenants.length;
  if (sumOfSquares === 0) {
    return 0;
  }
  return (sum * sum) / (n * sumOfSquares);
}

(async () => {
  const fairnessResults = {};

  for (const test of tests) {
    console.log(`\n--- Running ${test.name} Test ---`);
    // Step 1: Run k6 inside the container
    execSync(
      `docker exec -i ${test.container} k6 run --out json=/scripts/${test.out} /scripts/test.js`,
      { stdio: "inherit" }
    );
    // Step 2: Copy the JSON results file from the container to the host
    execSync(
      `docker cp ${test.container}:/scripts/${test.out} ${test.out}`
    );
    
    // Step 3: Process the local file
    await summarizeK6(test.out, test.summary);

    const summaryData = JSON.parse(fs.readFileSync(test.summary, "utf-8"));
    const fairness = calculateFairnessIndex(summaryData);
    fairnessResults[test.name] = fairness;
    console.log(`✅ Jain's Fairness Index for ${test.name}: ${fairness.toFixed(4)}`);
  }

  console.log("\n--- Final Fairness Summary ---");
  for (const name in fairnessResults) {
    console.log(`${name}: ${fairnessResults[name].toFixed(4)}`);
  }
})();