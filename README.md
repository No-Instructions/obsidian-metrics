# Obsidian Metrics Plugin

An Obsidian plugin that runs a Prometheus server and provides a public TypeScript API for registering and interacting with metrics.

## Features

- **Prometheus Server**: Built-in HTTP server serving metrics in Prometheus format
- **TypeScript API**: Full-featured API for creating and managing metrics
- **Multiple Metric Types**: Support for Counters, Gauges, Histograms, and Summaries
- **Built-in Metrics**: Automatic collection of system and plugin metrics
- **Settings Interface**: Configurable server settings and metric options
- **Global API Access**: Available to other plugins through `window.ObsidianMetrics`
- **Health Monitoring**: Built-in health check endpoint

## Installation

### Manual Installation

1. Clone this repository into your `.obsidian/plugins/` folder:
   ```bash
   cd /path/to/your/vault/.obsidian/plugins/
   git clone https://github.com/yourusername/obsidian-metrics-plugin.git
   ```

2. Install dependencies:
   ```bash
   cd obsidian-metrics-plugin
   npm install
   ```

3. Build the plugin:
   ```bash
   npm run build
   ```

4. Enable the plugin in Obsidian Settings → Community Plugins

### Development

1. Clone the repository
2. Run `npm install`
3. Run `npm run dev` for development with auto-rebuild
4. Reload Obsidian to see changes

## Usage

### Basic Setup

Once installed, the plugin will:
- Start a Prometheus server on port 9090 (configurable)
- Expose metrics at `http://localhost:9090/metrics`
- Add a status indicator to the status bar
- Provide a ribbon icon for quick access

### API Usage

#### Accessing the API

```typescript
// From another plugin
const metricsAPI = (window as any).ObsidianMetrics;

// Or get the plugin instance directly
const plugin = this.app.plugins.plugins['obsidian-metrics-plugin'];
const metricsAPI = plugin.getMetricsAPI();
```

#### Creating Metrics

##### Counter (values that only increase)
```typescript
const pageViewCounter = metricsAPI.createCounter({
    name: 'page_views_total',
    help: 'Total number of page views',
    labelNames: ['page_type', 'source']
});

// Increment
pageViewCounter.inc();
pageViewCounter.inc(5);
pageViewCounter.inc(1, { page_type: 'note', source: 'search' });
```

##### Gauge (values that can go up and down)
```typescript
const activeNotesGauge = metricsAPI.createGauge({
    name: 'active_notes_count',
    help: 'Number of currently active notes'
});

// Set value
activeNotesGauge.set(42);
activeNotesGauge.inc();
activeNotesGauge.dec(5);
```

##### Histogram (distribution of values in buckets)
```typescript
const loadTimeHistogram = metricsAPI.createHistogram({
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

##### Summary (quantiles over sliding time window)
```typescript
const responseSummary = metricsAPI.createSummary({
    name: 'api_response_duration_seconds',
    help: 'API response duration in seconds',
    percentiles: [0.5, 0.9, 0.95, 0.99]
});

// Observe values
responseSummary.observe(0.234);
```

#### Convenience Methods

```typescript
// Quick counter creation
const counter = metricsAPI.counter('button_clicks', 'Button click count', 1);

// Quick gauge creation  
const gauge = metricsAPI.gauge('memory_usage', 'Memory usage in bytes', 1024);

// Quick histogram creation
const hist = metricsAPI.histogram('request_duration', 'Request duration');
```

#### Measuring Function Execution

```typescript
// Measure async functions
const result = await metricsAPI.measureAsync('async_operation_duration', async () => {
    // Your async operation here
    return await someAsyncOperation();
});

// Measure sync functions
const result = metricsAPI.measureSync('sync_operation_duration', () => {
    // Your sync operation here
    return someCalculation();
});

// Manual timing
const timer = metricsAPI.createTimer('custom_operation_duration');
// ... do work ...
const durationMs = timer(); // Returns duration in milliseconds
```

#### Retrieving Metrics

```typescript
// Get a specific metric
const metric = metricsAPI.getMetric('page_views_total');
metric.inc();

// Get all metrics in Prometheus format
const allMetrics = metricsAPI.getAllMetrics();
console.log(allMetrics);

// Clear metrics
metricsAPI.clearMetric('page_views_total');
metricsAPI.clearAllMetrics(); // Clears all custom metrics
```

### Configuration

Access plugin settings through:
**Settings → Community Plugins → Obsidian Metrics**

#### Server Configuration
- **Enable Metrics Server**: Toggle the Prometheus server on/off
- **Server Port**: Configure the port (default: 9090)
- **Metrics Endpoint Path**: Configure the metrics endpoint (default: /metrics)

#### Metrics Configuration
- **Enable Built-in Metrics**: Collect real Obsidian usage metrics (file operations, vault stats, performance)
- **Custom Metrics Prefix**: Prefix for custom metrics (default: obsidian_)

### Built-in Metrics

When enabled, the plugin automatically collects real Obsidian performance data:

#### File Operations
- `obsidian_file_operations_total`: Real-time file operations (create, delete, modify, rename, open) with labels for operation type and file extension

#### Vault Statistics  
- `obsidian_vault_files_total`: Total number of files in the vault
- `obsidian_vault_notes_total`: Total number of markdown notes
- `obsidian_vault_size_bytes`: Total size of all vault files in bytes

#### Application State
- `obsidian_active_notes_count`: Number of currently open notes/tabs
- `obsidian_plugins_enabled_total`: Number of enabled plugins
- `obsidian_browser_memory_usage_bytes`: Browser memory usage (if available)

#### Performance Metrics
- `obsidian_note_view_duration_seconds`: Time spent viewing individual notes (histogram)
- `obsidian_app_performance_timing_seconds`: Various app operation timings (histogram with operation labels)

All metrics update in real-time as you use Obsidian, providing genuine insights into your usage patterns and vault statistics.

### Commands

The plugin provides several commands accessible via Command Palette:

- **Toggle Metrics Server**: Start/stop the metrics server
- **Show Current Metrics**: Display current metrics in a modal
- **Clear All Custom Metrics**: Remove all custom metrics

### Endpoints

#### Metrics Endpoint
- **URL**: `http://localhost:9090/metrics` (configurable)
- **Format**: Prometheus text format
- **Content-Type**: `text/plain`

#### Health Check Endpoint
- **URL**: `http://localhost:9090/health`
- **Format**: JSON
- **Response**:
  ```json
  {
    "status": "ok",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "metrics_endpoint": "/metrics"
  }
  ```

## Integration Examples

### Tracking Note Operations

```typescript
const api = (window as any).ObsidianMetrics;

// Create metrics
const noteOperations = api.createCounter({
    name: 'note_operations_total',
    help: 'Total note operations',
    labelNames: ['operation', 'file_extension']
});

const noteLoadTime = api.createHistogram({
    name: 'note_load_duration_seconds',
    help: 'Note loading duration'
});

// Track operations
this.app.workspace.on('file-open', (file) => {
    if (file) {
        const timer = noteLoadTime.startTimer();
        noteOperations.inc(1, { 
            operation: 'open', 
            file_extension: file.extension 
        });
        // Timer will be stopped automatically when the histogram observes
        setTimeout(() => timer(), 100); // Simulate load time
    }
});
```

### Plugin Performance Monitoring

```typescript
class MyPlugin extends Plugin {
    async onload() {
        const api = (window as any).ObsidianMetrics;
        
        // Track plugin initialization
        const initTimer = api.createTimer('my_plugin_init_duration');
        
        // ... plugin initialization code ...
        
        const initTime = initTimer();
        console.log(`Plugin initialized in ${initTime}ms`);
        
        // Track command execution
        this.addCommand({
            id: 'my-command',
            name: 'My Command',
            callback: () => {
                api.measureSync('my_command_duration', () => {
                    // Command implementation
                    this.doSomething();
                });
            }
        });
    }
}
```

## Troubleshooting

### Server Won't Start
- Check if port is already in use
- Verify port number is valid (1-65535)
- Check Obsidian console for error messages

### Metrics Not Appearing
- Ensure server is running (check status bar)
- Verify metrics endpoint URL
- Check that metrics are being created correctly

### API Not Available
- Ensure plugin is enabled
- Check browser console for errors
- Verify `window.ObsidianMetrics` is defined

## Development

### Project Structure

```
obsidian-metrics/
├── main.ts              # Main plugin file
├── metrics-manager.ts   # Core metrics management
├── metrics-api.ts       # Public TypeScript API
├── types.ts            # TypeScript type definitions
├── manifest.json       # Plugin manifest
├── package.json        # Dependencies and scripts
└── README.md          # Documentation
```

### Building

```bash
npm run build    # Production build
npm run dev      # Development with watch mode
```

### API Documentation

The plugin exposes these main interfaces:

- `ObsidianMetricsAPI`: Main public interface
- `MetricsManager`: Core metrics management
- `MetricInstance`: Individual metric interface
- `MetricsRegistry`: Registry interface

See `types.ts` for complete type definitions.

## License

MIT License - see LICENSE file for details.
