# Telemetry Performance Dashboards

This directory contains Kusto dashboard JSON files that can be imported into
[Azure Data Explorer](https://dataexplorer.azure.com) (ADX) to monitor Fluid Framework
telemetry in the Office Fluid Kusto cluster.

## Dashboards

### `telemetry-performance-sampling.dashboard.json`

**Purpose:** Tracks the sampling impact of PR #27126 on high-frequency performance
events emitted by Fluid Framework to the Office – Bohemia (Outlook Web) partner.

**Cluster / Database:**
- Cluster: `https://kusto.aria.microsoft.com`
- Database: `Outlook Web`
- Access: Requires `olkwebar` security group membership + VPN (Microsoft internal network)

> **Note:** OWA/Bohemia uses sampling in the `client_event` table. Raw counts are *not*
> unsampled event volumes — they represent the subset that passed the Bohemia sampler.
> The tiles that measure sampling ratio rely on the `count` property inside `MiscData`,
> which records how many actual operations were batched into a single log entry.

#### What the dashboard shows

| Section | Tiles | Purpose |
|---|---|---|
| **Overview** | All events timechart | Every tracked event as a separate line; declining lines confirm sampling is working |
| **Aggregate** | Total volume + Sampling effectiveness table | Single-line downward trend; `AvgSamplingRatio > 1` confirms sampling |
| **Before/After** | Comparison table | ±7-day window around the PR #27126 deployment date; shows % reduction |
| **Per-event sparklines** | 11 individual tiles | One timechart per event for pinpointing which events dropped the most |
| **Hourly detail** | Last-7-day hourly chart | Fine-grained view to detect the exact hour a deployment took effect |

#### Tracked events

The 11 events sampled by PR #27126:

| Event name | Source package |
|---|---|
| `fluid:telemetry:BlobManager:AttachmentBlobsLoaded` | `container-runtime` |
| `fluid:telemetry:CodeLoad_end` | `container-loader` |
| `fluid:telemetry:ConfigRead` | `telemetry-utils` |
| `fluid:telemetry:Container:noWaitOnDisconnected` | `container-loader` |
| `fluid:telemetry:ContainerRuntime:ConfigRead` | `container-runtime` |
| `fluid:telemetry:DeviceSpec` | `container-runtime` |
| `fluid:telemetry:FluidDataStoreRuntime:ddsEventCallbacks` | `shared-object-base` |
| `fluid:telemetry:FluidDataStoreRuntime:ddsOpProcessing` | `shared-object-base` |
| `fluid:telemetry:OdspDriver:CacheOpsRetrieved` | `odsp-driver` |
| `fluid:telemetry:OdspDriver:GetDeltas_end` | `odsp-driver` |
| `fluid:telemetry:OpPerf:ConnectionSpeed` | `container-runtime` |

#### Parameters

| Parameter | Variable | Default | Description |
|---|---|---|---|
| **Time range** | `_startTime` / `_endTime` | Last 30 days | Controls the time window for all tiles |
| **PR #27126 Deploy Date** | `_prDeployDate` | `2025-04-01` | The date the sampling change reached Bohemia Production; used by the Before/After comparison tile — **update this after confirming the real deployment date** |

> **Note on the `sampledEvents` list:** ADX dashboards do not support shared let-clauses across tiles, so the event list is intentionally repeated in each multi-event tile query. If you need to add or remove events, update all affected tiles together.

1. Open [dataexplorer.azure.com](https://dataexplorer.azure.com) and sign in with your
   Microsoft account.
2. Connect to the cluster `https://kusto.aria.microsoft.com` (VPN required).
3. In the left sidebar, click **Dashboards** → **+ New dashboard** → **Import dashboard
   from file**.
4. Upload `telemetry-performance-sampling.dashboard.json`.
5. After importing, open the dashboard and update the `prDeployDate` variable in the
   **Before / After PR #27126** tile to the date the PR reached Bohemia Production.
