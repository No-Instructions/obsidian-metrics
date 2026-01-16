# Obsidian Metrics Plugin

An Obsidian plugin that runs a Prometheus server and provides a public TypeScript API for registering and interacting with metrics.

## Features

- **Prometheus Server**: Built-in HTTP server serving metrics in Prometheus format
- **TypeScript API**: Full-featured API for creating and managing metrics
- **Multiple Metric Types**: Support for Counters, Gauges, Histograms, and Summaries
- **Built-in Metrics**: Automatic collection of system and plugin metrics
- **Default Labels**: All metrics automatically include `vault_name` and `vault_id` labels
- **Plugin Integration**: Event-based API for other plugins with proper load order handling
- **Settings Interface**: Configurable server settings and metric options

## Installation

### Manual Installation

1. Clone this repository into your `.obsidian/plugins/` folder:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins/
   git clone https://github.com/yourusername/obsidian-metrics.git
   ```

2. Install dependencies and build:
   ```bash
   cd obsidian-metrics
   npm install
   npm run build
   ```

3. Enable the plugin in Obsidian Settings -> Community Plugins

## Usage

### Basic Setup

Once installed, the plugin will:
- Start a Prometheus server on port 9090 (configurable)
- Expose metrics at `http://localhost:9090/metrics`
- Add a status indicator to the status bar
- Provide a ribbon icon for quick access

### API for Other Plugins

#### Type Definitions

Copy `obsidian-metrics.d.ts` into your plugin for type-safe API access. This file contains:
- All interface definitions (`IObsidianMetricsAPI`, `MetricInstance`, etc.)
- Module augmentation for the `obsidian-metrics:ready` workspace event
- Comprehensive usage documentation

#### Accessing the API

```typescript
import { IObsidianMetricsAPI, MetricInstance, ObsidianMetricsPlugin } from './obsidian-metrics';

class MyPlugin extends Plugin {
  private metricsApi: IObsidianMetricsAPI | undefined;
  private myGauge: MetricInstance | undefined;

  async onload() {
    // Listen for metrics API becoming available (handles load order and reloads)
    this.registerEvent(
      this.app.workspace.on('obsidian-metrics:ready', (api: IObsidianMetricsAPI) => {
        this.initializeMetrics(api);
      })
    );

    // Also try to get it immediately in case metrics plugin loaded first
    const metricsPlugin = this.app.plugins.plugins['obsidian-metrics'] as ObsidianMetricsPlugin | undefined;
    if (metricsPlugin?.api) {
      this.initializeMetrics(metricsPlugin.api);
    }
  }

  private initializeMetrics(api: IObsidianMetricsAPI) {
    this.metricsApi = api;

    // Metric creation is idempotent - safe to call multiple times
    this.myGauge = api.createGauge({
      name: 'my_document_size_bytes',
      help: 'Size of documents in bytes',
      labelNames: ['document']
    });
  }

  updateDocumentSize(doc: string, bytes: number) {
    this.myGauge?.labels({ document: doc }).set(bytes);
  }
}
```

#### Key Points

- **Do NOT cache the API or metrics long-term** - they become stale if obsidian-metrics reloads
- Listen for `obsidian-metrics:ready` and re-initialize your metrics each time it fires
- Metric creation is idempotent: calling `createGauge()` with the same name returns the existing metric
- All metrics automatically include `vault_name` and `vault_id` labels

### Creating Metrics

#### Counter (values that only increase)
```typescript
const pageViewCounter = api.createCounter({
  name: 'page_views_total',
  help: 'Total number of page views',
  labelNames: ['page_type', 'source']
});

// Increment
pageViewCounter.inc();
pageViewCounter.inc(5);
pageViewCounter.inc(1, { page_type: 'note', source: 'search' });

// Or use fluent labels() API
pageViewCounter.labels({ page_type: 'note', source: 'search' }).inc();
```

#### Gauge (values that can go up and down)
```typescript
const activeNotesGauge = api.createGauge({
  name: 'active_notes_count',
  help: 'Number of currently active notes'
});

// Set value
activeNotesGauge.set(42);
activeNotesGauge.inc();
activeNotesGauge.dec(5);

// With labels
activeNotesGauge.labels({ workspace: 'main' }).set(10);
```

#### Histogram (distribution of values in buckets)
```typescript
const loadTimeHistogram = api.createHistogram({
  name: 'page_load_duration_seconds',
  help: 'Page load duration in seconds',
  buckets: [0.1, 0.5, 1, 2, 5]
});

// Observe values
loadTimeHistogram.observe(1.2);
loadTimeHistogram.observe(0.8, { page_type: 'canvas' });

// Time operations
const timer = loadTimeHistogram.startTimer();
// ... do work ...
timer(); // Automatically observes the duration
```

#### Summary (quantiles over sliding time window)
```typescript
const responseSummary = api.createSummary({
  name: 'api_response_duration_seconds',
  help: 'API response duration in seconds',
  percentiles: [0.5, 0.9, 0.95, 0.99]
});

responseSummary.observe(0.234);
```

### Convenience Methods

```typescript
// Quick counter creation
const counter = api.counter('button_clicks', 'Button click count', 1);

// Quick gauge creation
const gauge = api.gauge('memory_usage', 'Memory usage in bytes', 1024);

// Quick histogram creation
const hist = api.histogram('request_duration', 'Request duration');
```

### Measuring Function Execution

```typescript
// Measure async functions
const result = await api.measureAsync('async_operation_duration', async () => {
  return await someAsyncOperation();
});

// Measure sync functions
const result = api.measureSync('sync_operation_duration', () => {
  return someCalculation();
});

// Manual timing
const timer = api.createTimer('custom_operation_duration');
// ... do work ...
const durationMs = timer(); // Returns duration in milliseconds
```

## Configuration

Access plugin settings through **Settings -> Community Plugins -> Obsidian Metrics**

### Server Configuration
- **Enable Metrics Server**: Toggle the Prometheus server on/off
- **Server Port**: Configure the port (default: 9090)
- **Metrics Endpoint Path**: Configure the metrics endpoint (default: /metrics)

### Metrics Configuration
- **Enable Built-in Metrics**: Collect real Obsidian usage metrics
- **Custom Metrics Prefix**: Prefix for custom metrics (default: `obsidian_`)

## Built-in Metrics

When enabled, the plugin automatically collects:

### File Operations
- `obsidian_file_operations_total`: File operations with `operation` and `file_type` labels

### Vault Statistics
- `obsidian_vault_files_total`: Total files in vault
- `obsidian_vault_notes_total`: Total markdown notes
- `obsidian_vault_size_bytes`: Total vault size

### Application State
- `obsidian_active_notes_count`: Open notes/tabs
- `obsidian_plugins_enabled_total`: Enabled plugins
- `obsidian_browser_memory_usage_bytes`: Browser memory usage

### Performance
- `obsidian_note_view_duration_seconds`: Time viewing notes (histogram)
- `obsidian_app_performance_timing_seconds`: App operation timings (histogram)

All metrics include `vault_name` and `vault_id` labels automatically.

## Endpoints

### Metrics Endpoint
- **URL**: `http://localhost:9090/metrics`
- **Format**: Prometheus text format

### Health Check
- **URL**: `http://localhost:9090/health`
- **Response**: `{ "status": "ok", "timestamp": "...", "metrics_endpoint": "/metrics" }`

## Project Structure

```
obsidian-metrics/
├── main.ts                  # Main plugin file
├── metrics-manager.ts       # Core metrics management
├── metrics-api.ts           # Public API implementation
├── types.ts                 # Internal type definitions
├── obsidian-metrics.d.ts    # Public type declarations (copy to your plugin)
├── manifest.json            # Plugin manifest
└── package.json             # Dependencies
```

## Development

```bash
npm install      # Install dependencies
npm run build    # Production build
npm run dev      # Development with watch mode
```

## License

MIT License
