export interface MetricLabels {
	[key: string]: string;
}

export interface CounterOptions {
	name: string;
	help: string;
	labels?: string[];
	labelNames?: string[];
}

export interface GaugeOptions {
	name: string;
	help: string;
	labels?: string[];
	labelNames?: string[];
}

export interface HistogramOptions {
	name: string;
	help: string;
	labels?: string[];
	labelNames?: string[];
	buckets?: number[];
}

export interface SummaryOptions {
	name: string;
	help: string;
	labels?: string[];
	labelNames?: string[];
	percentiles?: number[];
	maxAgeSeconds?: number;
	ageBuckets?: number;
}

export interface MetricsServerConfig {
	port: number;
	path: string;
	enabled: boolean;
}

export interface ObsidianMetricsSettings {
	serverConfig: MetricsServerConfig;
	enableBuiltInMetrics: boolean;
	customMetricsPrefix: string;
}

export interface MetricInstance {
	inc(value?: number, labels?: MetricLabels): void;
	dec(value?: number, labels?: MetricLabels): void;
	set(value: number, labels?: MetricLabels): void;
	observe(value: number, labels?: MetricLabels): void;
	startTimer(labels?: MetricLabels): () => void;
}

export interface MetricsRegistry {
	getMetric(name: string): MetricInstance | undefined;
	getAllMetrics(): Promise<string>;
	clearMetric(name: string): boolean;
	clearAllMetrics(): void;
}