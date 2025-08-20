import json
import pandas as pd
import matplotlib.pyplot as plt

FILES = [
    ("tb_summary.json", "Token_Bucket"),
    ("ca_summary.json", "Custom_Algo")
]

def load_summary(file):
    with open(file) as f:
        return json.load(f)

# --- NEW FUNCTION ---
def plot_per_tenant_allowed_requests(data, label):
    per_tenant_counts = data.get("allowed_requests", {}).get("perTenant", {})
    if not per_tenant_counts:
        return
    
    df = pd.DataFrame(per_tenant_counts.items(), columns=['Tenant', 'Allowed Requests'])
    
    plt.figure(figsize=(10, 6))
    plt.bar(df['Tenant'], df['Allowed Requests'], color='skyblue')
    plt.title(f'Per-Tenant Allowed Requests ({label})')
    plt.xlabel('Tenant')
    plt.ylabel('Number of Allowed Requests')
    plt.xticks(rotation=45)
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.tight_layout()
    plt.savefig(f"per_tenant_allowed_{label}.png")
    plt.close()
    print(f"✅ Saved per_tenant_allowed_{label}.png")

# --- NEW FUNCTION ---
def plot_latency_percentiles(all_data):
    percentiles = [50, 90, 99]
    data_for_plot = []
    
    for label, summary in all_data.items():
        samples = summary.get("http_req_duration", {}).get("samples", [])
        if not samples:
            continue
        
        series = pd.Series(samples)
        p_values = {p: series.quantile(p / 100) for p in percentiles}
        data_for_plot.append({'Algorithm': label, **p_values})

    df = pd.DataFrame(data_for_plot)
    df.set_index('Algorithm', inplace=True)
    
    df.plot(kind='bar', figsize=(10, 6), rot=0)
    plt.title('Latency Percentile Comparison', fontsize=16)
    plt.ylabel('Latency (ms)', fontsize=12)
    plt.xlabel('Algorithm', fontsize=12)
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.legend(title='Percentile')
    plt.tight_layout()
    plt.savefig("latency_percentiles_comparison.png")
    plt.close()
    print("✅ Saved latency_percentiles_comparison.png")

all_summaries = {}

# Process each summary file
for file, label in FILES:
    data = load_summary(file)
    all_summaries[label] = data
    plot_per_tenant_allowed_requests(data, label)

# Generate combined latency percentile plot