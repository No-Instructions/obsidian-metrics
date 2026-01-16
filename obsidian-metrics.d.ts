/**
 * Type declarations for the Obsidian Metrics API
 *
 * Copy this file into your plugin to get type-safe access to window.ObsidianMetrics
 *
 * @example
 * const metrics = window.ObsidianMetrics;
 * if (metrics) {
 *   const gauge = metrics.createGauge({
 *     name: 'my_metric',
 *     help: 'My metric description',
 *     labelNames: ['document']
 *   });
 *   gauge.labels({ document: 'note.md' }).set(42);
 * }
 */

export interface MetricLabels {
	[key: string]: string;
}

export interface CounterOptions {
	name: string;
	help: string;
	labelNames?: string[];
}

export interface GaugeOptions {
	name: string;
	help: string;
	labelNames?: string[];
}

export interface HistogramOptions {
	name: string;
	help: string;
	labelNames?: string[];
	buckets?: number[];
}

export interface SummaryOptions {
	name: string;
	help: string;
	labelNames?: string[];
	percentiles?: number[];
	maxAgeSeconds?: number;
	ageBuckets?: number;
}

export interface LabeledMetricInstance {
	inc(value?: number): void;
	dec(value?: number): void;
	set(value: number): void;
	observe(value: number): void;
	startTimer(): () => void;
}

export interface MetricInstance {
	inc(value?: number, labels?: MetricLabels): void;
	dec(value?: number, labels?: MetricLabels): void;
	set(value: number, labels?: MetricLabels): void;
	observe(value: number, labels?: MetricLabels): void;
	startTimer(labels?: MetricLabels): () => void;
	labels(labels: MetricLabels): LabeledMetricInstance;
}

export interface IObsidianMetricsAPI {
	// Metric retrieval
	getMetric(name: string): MetricInstance | undefined;
	getAllMetrics(): Promise<string>;
	clearMetric(name: string): boolean;
	clearAllMetrics(): void;

	// Metric creation
	createCounter(options: CounterOptions): MetricInstance;
	createGauge(options: GaugeOptions): MetricInstance;
	createHistogram(options: HistogramOptions): MetricInstance;
	createSummary(options: SummaryOptions): MetricInstance;

	// Convenience methods (create + optional initial value)
	counter(name: string, help: string, value?: number): MetricInstance;
	gauge(name: string, help: string, value?: number): MetricInstance;
	histogram(name: string, help: string, buckets?: number[]): MetricInstance;
	summary(name: string, help: string, percentiles?: number[]): MetricInstance;

	// Timing utilities
	createTimer(metricName: string): () => number;
	measureAsync<T>(metricName: string, fn: () => Promise<T>): Promise<T>;
	measureSync<T>(metricName: string, fn: () => T): T;
}

declare global {
	interface Window {
		ObsidianMetrics?: IObsidianMetricsAPI;
	}
}
