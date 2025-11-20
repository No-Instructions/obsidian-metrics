import { App, Notice, Plugin, PluginSettingTab, Setting, Modal } from 'obsidian';
import * as http from 'http';
import { URL } from 'url';
import { MetricsManager } from './metrics-manager';
import { ObsidianMetricsAPI, initializeMetricsAPI } from './metrics-api';
import { ObsidianMetricsSettings, MetricsServerConfig } from './types';

const DEFAULT_SETTINGS: ObsidianMetricsSettings = {
	serverConfig: {
		port: 9090,
		path: '/metrics',
		enabled: true
	},
	enableBuiltInMetrics: true,
	customMetricsPrefix: 'obsidian_'
};

export default class ObsidianMetricsPlugin extends Plugin {
	settings: ObsidianMetricsSettings;
	private metricsManager: MetricsManager;
	private metricsAPI: ObsidianMetricsAPI;
	public server: http.Server | null = null;

	async onload() {
		await this.loadSettings();

		// Initialize metrics manager and API
		this.metricsManager = new MetricsManager(this.settings.customMetricsPrefix);
		this.metricsAPI = initializeMetricsAPI(this.metricsManager);

		// Set up HTTP server for metrics endpoint
		this.setupMetricsServer();

		// Start the metrics server if enabled
		if (this.settings.serverConfig.enabled) {
			try {
				await this.startMetricsServer();
			} catch (error) {
				console.warn('Failed to start metrics server during plugin load:', error);
				// Don't block plugin loading if server fails to start
			}
		}

		// Add ribbon icon for metrics control
		const ribbonIconEl = this.addRibbonIcon('bar-chart-2', 'Obsidian Metrics', () => {
			new MetricsModal(this.app, this.metricsAPI).open();
		});
		ribbonIconEl.addClass('obsidian-metrics-ribbon');

		// Add status bar item showing server status
		const statusBarItemEl = this.addStatusBarItem();
		this.updateStatusBar(statusBarItemEl);

		// Add commands
		this.addCommand({
			id: 'toggle-metrics-server',
			name: 'Toggle Metrics Server',
			callback: async () => {
				if (this.server) {
					await this.stopMetricsServer();
				} else {
					await this.startMetricsServer();
				}
			}
		});

		this.addCommand({
			id: 'show-metrics',
			name: 'Show Current Metrics',
			callback: () => {
				new MetricsModal(this.app, this.metricsAPI).open();
			}
		});

		this.addCommand({
			id: 'clear-all-metrics',
			name: 'Clear All Custom Metrics',
			callback: () => {
				this.metricsAPI.clearAllMetrics();
				new Notice('All custom metrics cleared');
			}
		});

		// Add settings tab
		this.addSettingTab(new MetricsSettingTab(this.app, this));

		// Create some built-in metrics for demonstration
		if (this.settings.enableBuiltInMetrics) {
			this.setupBuiltInMetrics();
		}

		// Global exposure for other plugins
		(window as any).ObsidianMetrics = this.metricsAPI;

		new Notice('Obsidian Metrics plugin loaded');
	}

	async onunload() {
		await this.stopMetricsServer();
		
		// Clean up global exposure
		if ((window as any).ObsidianMetrics) {
			delete (window as any).ObsidianMetrics;
		}
	}

	private setupMetricsServer() {
		this.server = http.createServer(async (req, res) => {
			// Enable CORS
			res.setHeader('Access-Control-Allow-Origin', '*');
			res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
			res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

			if (req.method === 'OPTIONS') {
				res.writeHead(200);
				res.end();
				return;
			}

			const url = new URL(req.url || '', `http://localhost:${this.settings.serverConfig.port}`);
			
			try {
				if (url.pathname === this.settings.serverConfig.path) {
					// Metrics endpoint
					const metrics = await this.metricsManager.getAllMetrics();
					res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
					res.end(metrics);
				} else if (url.pathname === '/health') {
					// Health check endpoint
					const healthData = {
						status: 'ok',
						timestamp: new Date().toISOString(),
						metrics_endpoint: this.settings.serverConfig.path
					};
					res.writeHead(200, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify(healthData, null, 2));
				} else {
					// 404 for unknown paths
					res.writeHead(404, { 'Content-Type': 'application/json' });
					res.end(JSON.stringify({ 
						error: 'Not Found', 
						available_endpoints: [this.settings.serverConfig.path, '/health']
					}));
				}
			} catch (error) {
				console.error('Metrics server error:', error);
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: 'Internal Server Error' }));
			}
		});
	}

	public async startMetricsServer(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.server) {
				this.setupMetricsServer();
			}

			if (this.server && this.server.listening) {
				resolve();
				return;
			}

			this.server?.listen(this.settings.serverConfig.port, () => {
				new Notice(`Metrics server started on port ${this.settings.serverConfig.port}`);
				this.updateStatusBar();
				resolve();
			}).on('error', (err: any) => {
				console.warn('Metrics server failed to start:', err);
				
				let message = `Metrics server disabled - port ${this.settings.serverConfig.port} not available`;
				if (err.code === 'EADDRINUSE') {
					message += '. Another service is using this port.';
				} else if (err.code === 'EACCES') {
					message += '. Permission denied (try a port > 1024).';
				}
				
				new Notice(message + ' Change port in plugin settings.', 8000);
				
				// Disable server in settings but don't crash
				this.settings.serverConfig.enabled = false;
				this.saveSettings();
				this.server = null;
				this.updateStatusBar();
				
				// Resolve anyway so plugin continues to load
				resolve();
			});
		});
	}

	public async stopMetricsServer(): Promise<void> {
		return new Promise((resolve) => {
			if (!this.server) {
				resolve();
				return;
			}

			this.server.close(() => {
				this.server = null;
				new Notice('Metrics server stopped');
				this.updateStatusBar();
				resolve();
			});
		});
	}

	private updateStatusBar(statusBarElement?: HTMLElement) {
		const statusBar = statusBarElement || document.querySelector('.obsidian-metrics-status');
		if (statusBar) {
			const status = this.server ? 'Running' : 'Stopped';
			const port = this.settings.serverConfig.port;
			(statusBar as HTMLElement).textContent = `Metrics: ${status}${this.server ? `:${port}` : ''}`;
		} else if (!statusBarElement) {
			const statusBarItemEl = this.addStatusBarItem();
			statusBarItemEl.addClass('obsidian-metrics-status');
			this.updateStatusBar(statusBarItemEl);
		}
	}

	private setupBuiltInMetrics() {
		// Real file operations counter
		const fileOpsCounter = this.metricsAPI.createCounter({
			name: 'file_operations_total',
			help: 'Total number of file operations in Obsidian',
			labelNames: ['operation', 'file_type']
		});

		// Track file operations using Obsidian's workspace events
		this.registerEvent(this.app.workspace.on('file-open', (file) => {
			if (file) {
				const extension = file.path.split('.').pop() || 'unknown';
				fileOpsCounter.inc(1, {
					operation: 'open',
					file_type: extension
				});
			}
		}));

		this.registerEvent(this.app.vault.on('create', (file) => {
			const extension = file.path.split('.').pop() || 'unknown';
			fileOpsCounter.inc(1, {
				operation: 'create',
				file_type: extension
			});
		}));

		this.registerEvent(this.app.vault.on('delete', (file) => {
			const extension = file.path.split('.').pop() || 'unknown';
			fileOpsCounter.inc(1, {
				operation: 'delete',
				file_type: extension
			});
		}));

		this.registerEvent(this.app.vault.on('modify', (file) => {
			const extension = file.path.split('.').pop() || 'unknown';
			fileOpsCounter.inc(1, {
				operation: 'modify',
				file_type: extension
			});
		}));

		this.registerEvent(this.app.vault.on('rename', (file, oldPath) => {
			const extension = file.path.split('.').pop() || 'unknown';
			fileOpsCounter.inc(1, {
				operation: 'rename',
				file_type: extension
			});
		}));

		// Vault statistics gauges
		const vaultStatsGauges = {
			totalFiles: this.metricsAPI.createGauge({
				name: 'vault_files_total',
				help: 'Total number of files in the vault'
			}),
			totalNotes: this.metricsAPI.createGauge({
				name: 'vault_notes_total', 
				help: 'Total number of markdown notes in the vault'
			}),
			totalSize: this.metricsAPI.createGauge({
				name: 'vault_size_bytes',
				help: 'Total size of all files in the vault (bytes)'
			})
		};

		// Memory usage gauge (browser memory, not Node.js)
		const memoryGauge = this.metricsAPI.createGauge({
			name: 'browser_memory_usage_bytes',
			help: 'Browser memory usage (if available)'
		});

		// Active notes gauge
		const activeNotesGauge = this.metricsAPI.createGauge({
			name: 'active_notes_count',
			help: 'Number of currently open notes'
		});

		// Plugin count gauge
		const pluginCountGauge = this.metricsAPI.createGauge({
			name: 'plugins_enabled_total',
			help: 'Number of enabled plugins'
		});

		// Update vault statistics and other metrics periodically
		const updateMetrics = async () => {
			try {
				// Count files and notes
				const allFiles = this.app.vault.getAllLoadedFiles();
				const notes = allFiles.filter(file => file.path.endsWith('.md'));
				
				vaultStatsGauges.totalFiles.set(allFiles.length);
				vaultStatsGauges.totalNotes.set(notes.length);

				// Calculate total vault size (approximate)
				let totalSize = 0;
				for (const file of allFiles) {
					try {
						const stat = await this.app.vault.adapter.stat(file.path);
						if (stat && !stat.type) { // is file, not folder
							totalSize += stat.size || 0;
						}
					} catch (error) {
						// File might not exist or be accessible, skip it
					}
				}
				vaultStatsGauges.totalSize.set(totalSize);

				// Count active (open) notes
				const activeLeaves = this.app.workspace.getLeavesOfType('markdown');
				activeNotesGauge.set(activeLeaves.length);

				// Count enabled plugins
				const enabledPlugins = Object.keys((this.app as any).plugins?.enabledPlugins || {});
				pluginCountGauge.set(enabledPlugins.length);

				// Update browser memory if available
				if ((performance as any).memory) {
					memoryGauge.set((performance as any).memory.usedJSHeapSize);
				}

			} catch (error) {
				console.warn('Error updating vault metrics:', error);
			}
		};

		// Update metrics immediately and then every 30 seconds
		updateMetrics();
		this.registerInterval(window.setInterval(updateMetrics, 30000));

		// Note switching/view time tracking
		const noteViewHistogram = this.metricsAPI.createHistogram({
			name: 'note_view_duration_seconds',
			help: 'Time spent viewing individual notes',
			buckets: [1, 5, 10, 30, 60, 300, 1800] // 1s to 30min
		});

		let currentNoteTimer: (() => void) | null = null;

		this.registerEvent(this.app.workspace.on('active-leaf-change', (leaf) => {
			// End timer for previous note
			if (currentNoteTimer) {
				currentNoteTimer();
				currentNoteTimer = null;
			}

			// Start timer for new note
			if (leaf && leaf.view.getViewType() === 'markdown') {
				currentNoteTimer = noteViewHistogram.startTimer();
			}
		}));

		// App performance metrics
		const appPerformanceHistogram = this.metricsAPI.createHistogram({
			name: 'app_performance_timing_seconds',
			help: 'Various app performance timings',
			labelNames: ['operation'],
			buckets: [0.001, 0.01, 0.1, 0.5, 1, 2, 5]
		});

		// Track search operations (simple example)
		const originalSearch = this.app.vault.adapter.list?.bind(this.app.vault.adapter);
		if (originalSearch) {
			this.app.vault.adapter.list = (path: string) => {
				const timer = appPerformanceHistogram.startTimer({ operation: 'vault_list' });
				const result = originalSearch(path);
				result.then(() => timer()).catch(() => timer());
				return result;
			};
		}
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Restart server if configuration changed
		if (this.server && this.settings.serverConfig.enabled) {
			await this.stopMetricsServer();
			await this.startMetricsServer();
		}
	}

	// Public API for other plugins
	public getMetricsAPI(): ObsidianMetricsAPI {
		return this.metricsAPI;
	}
}

class MetricsModal extends Modal {
	private metricsAPI: ObsidianMetricsAPI;

	constructor(app: App, metricsAPI: ObsidianMetricsAPI) {
		super(app);
		this.metricsAPI = metricsAPI;
	}

	async onOpen() {
		const { contentEl } = this;
		contentEl.empty();

		contentEl.createEl('h2', { text: 'Current Metrics' });

		const metricsContainer = contentEl.createDiv();
		metricsContainer.addClass('metrics-display');
		
		try {
			const metricsText = await this.metricsAPI.getAllMetrics();
			
			if (metricsText) {
				const preEl = metricsContainer.createEl('pre');
				preEl.style.fontSize = '12px';
				preEl.style.backgroundColor = 'var(--background-secondary)';
				preEl.style.padding = '10px';
				preEl.style.borderRadius = '5px';
				preEl.style.overflow = 'auto';
				preEl.style.maxHeight = '400px';
				preEl.textContent = metricsText;
			} else {
				metricsContainer.createEl('p', { text: 'No metrics available' });
			}
		} catch (error: any) {
			metricsContainer.createEl('p', { text: 'Error loading metrics: ' + error.message });
		}

		const buttonContainer = contentEl.createDiv();
		buttonContainer.style.marginTop = '20px';
		buttonContainer.style.display = 'flex';
		buttonContainer.style.gap = '10px';

		const refreshButton = buttonContainer.createEl('button', { text: 'Refresh' });
		refreshButton.onclick = () => {
			this.onOpen();
		};

		const clearButton = buttonContainer.createEl('button', { text: 'Clear Custom Metrics' });
		clearButton.onclick = () => {
			this.metricsAPI.clearAllMetrics();
			new Notice('Custom metrics cleared');
			this.onOpen();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

class MetricsSettingTab extends PluginSettingTab {
	plugin: ObsidianMetricsPlugin;

	constructor(app: App, plugin: ObsidianMetricsPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		containerEl.createEl('h2', { text: 'Obsidian Metrics Settings' });

		// Server Configuration
		containerEl.createEl('h3', { text: 'Prometheus Server' });

		new Setting(containerEl)
			.setName('Enable Metrics Server')
			.setDesc('Start the Prometheus metrics server')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.serverConfig.enabled)
				.onChange(async (value) => {
					this.plugin.settings.serverConfig.enabled = value;
					await this.plugin.saveSettings();
					
					if (value) {
						await this.plugin.startMetricsServer();
					} else {
						await this.plugin.stopMetricsServer();
					}
					
					// Refresh the settings display to show updated status
					this.display();
				}));

		new Setting(containerEl)
			.setName('Server Port')
			.setDesc('Port for the Prometheus metrics server (1024-65535 recommended)')
			.addText(text => text
				.setPlaceholder('9090')
				.setValue(this.plugin.settings.serverConfig.port.toString())
				.onChange(async (value) => {
					const port = parseInt(value);
					if (!isNaN(port) && port > 0 && port <= 65535) {
						this.plugin.settings.serverConfig.port = port;
						await this.plugin.saveSettings();
						
						// If server was enabled, restart it with new port
						if (this.plugin.settings.serverConfig.enabled && this.plugin.server) {
							await this.plugin.stopMetricsServer();
							await this.plugin.startMetricsServer();
							this.display(); // Refresh status
						}
					}
				}));

		new Setting(containerEl)
			.setName('Metrics Endpoint Path')
			.setDesc('HTTP path for metrics endpoint')
			.addText(text => text
				.setPlaceholder('/metrics')
				.setValue(this.plugin.settings.serverConfig.path)
				.onChange(async (value) => {
					this.plugin.settings.serverConfig.path = value.startsWith('/') ? value : '/' + value;
					await this.plugin.saveSettings();
				}));

		// Metrics Configuration
		containerEl.createEl('h3', { text: 'Metrics Configuration' });

		new Setting(containerEl)
			.setName('Enable Built-in Metrics')
			.setDesc('Collect basic system and plugin metrics')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableBuiltInMetrics)
				.onChange(async (value) => {
					this.plugin.settings.enableBuiltInMetrics = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Custom Metrics Prefix')
			.setDesc('Prefix for custom metrics (should end with _)')
			.addText(text => text
				.setPlaceholder('obsidian_')
				.setValue(this.plugin.settings.customMetricsPrefix)
				.onChange(async (value) => {
					this.plugin.settings.customMetricsPrefix = value;
					await this.plugin.saveSettings();
				}));

		// Status Information
		containerEl.createEl('h3', { text: 'Status' });

		const statusContainer = containerEl.createDiv();
		statusContainer.style.padding = '10px';
		statusContainer.style.backgroundColor = 'var(--background-secondary)';
		statusContainer.style.borderRadius = '5px';
		statusContainer.style.marginBottom = '10px';

		const isServerRunning = this.plugin.server && this.plugin.server.listening;
		const serverStatus = isServerRunning ? '✅ Running' : '❌ Stopped';
		const serverUrl = isServerRunning ? 
			`http://localhost:${this.plugin.settings.serverConfig.port}${this.plugin.settings.serverConfig.path}` : 
			'N/A';

		statusContainer.createEl('p', { 
			text: `Server Status: ${serverStatus}`,
			attr: { style: 'margin: 5px 0; font-weight: bold;' }
		});

		statusContainer.createEl('p', { 
			text: `Port: ${this.plugin.settings.serverConfig.port}`,
			attr: { style: 'margin: 5px 0;' }
		});

		if (isServerRunning) {
			const urlEl = statusContainer.createEl('p', { 
				text: 'Metrics URL: ',
				attr: { style: 'margin: 5px 0;' }
			});
			const linkEl = urlEl.createEl('a', { 
				text: serverUrl, 
				href: serverUrl,
				attr: { target: '_blank', style: 'color: var(--text-accent);' }
			});

			const healthUrlEl = statusContainer.createEl('p', { 
				text: 'Health Check: ',
				attr: { style: 'margin: 5px 0;' }
			});
			const healthLinkEl = healthUrlEl.createEl('a', { 
				text: `http://localhost:${this.plugin.settings.serverConfig.port}/health`,
				href: `http://localhost:${this.plugin.settings.serverConfig.port}/health`,
				attr: { target: '_blank', style: 'color: var(--text-accent);' }
			});
		} else {
			if (this.plugin.settings.serverConfig.enabled) {
				statusContainer.createEl('p', { 
					text: '⚠️ Server enabled but not running (port conflict?)',
					attr: { style: 'margin: 5px 0; color: var(--text-warning);' }
				});

				// Add retry button
				const retryButton = new Setting(statusContainer)
					.setName('Retry Server Start')
					.setDesc('Try to start the server again with current settings')
					.addButton(button => button
						.setButtonText('Retry')
						.onClick(async () => {
							button.setButtonText('Starting...');
							button.setDisabled(true);
							
							this.plugin.settings.serverConfig.enabled = true;
							await this.plugin.startMetricsServer();
							
							setTimeout(() => {
								this.display(); // Refresh the entire settings display
							}, 1000);
						}));
			} else {
				statusContainer.createEl('p', { 
					text: 'Server disabled in settings',
					attr: { style: 'margin: 5px 0; color: var(--text-muted);' }
				});
			}
		}
	}
}
