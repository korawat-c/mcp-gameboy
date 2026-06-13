import { GameBoyEmulator } from './gameboy';
import { GameBoyButton } from './types';
import { ImageContent } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/logger';

/**
 * Service class to encapsulate GameBoyEmulator interactions.
 */
export class EmulatorService {
  private emulator: GameBoyEmulator;

  constructor(emulator: GameBoyEmulator) {
    this.emulator = emulator;
    log.info('EmulatorService initialized');
  }

  /**
   * Checks if a ROM is currently loaded.
   * @returns True if a ROM is loaded, false otherwise.
   */
  isRomLoaded(): boolean {
    return this.emulator.isRomLoaded();
  }

  /**
   * Gets the path of the currently loaded ROM.
   * @returns The ROM path or undefined if no ROM is loaded.
   */
  getRomPath(): string | undefined {
    return this.emulator.getRomPath();
  }

  /**
   * Loads a GameBoy ROM file.
   * @param romPath Path to the ROM file.
   * @returns The initial screen content after loading.
   * @throws Error if the ROM file doesn't exist or fails to load.
   */
  loadRom(romPath: string): ImageContent {
    log.info(`Attempting to load ROM: ${romPath}`);
    if (!fs.existsSync(romPath)) {
      log.error(`ROM file not found: ${romPath}`);
      throw new Error(`ROM file not found: ${romPath}`);
    }

    try {
      this.emulator.loadRom(romPath);
      log.info(`ROM loaded successfully: ${path.basename(romPath)}`);

      // Advance a few frames to initialize the screen
      for (let i = 0; i < 5; i++) {
        this.emulator.doFrame();
      }
      log.verbose('Advanced initial frames after ROM load');

      return this.getScreen();
    } catch (error) {
      log.error(`Error loading ROM: ${romPath}`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to load ROM: ${romPath}. Reason: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private resolveStatePath(statePath: string): string {
    if (!statePath || !statePath.trim()) {
      throw new Error('State path is required');
    }
    const requestedPath = statePath.trim();
    if (path.isAbsolute(requestedPath)) {
      return requestedPath;
    }
    const normalizedPath = path.normalize(requestedPath);
    return normalizedPath === 'states' || normalizedPath.startsWith(`states${path.sep}`)
      ? path.join(process.cwd(), normalizedPath)
      : path.join(process.cwd(), 'states', normalizedPath);
  }

  /**
   * Save a full emulator state to a JSON file.
   */
  saveState(statePath: string): { path: string; bytes: number; romPath?: string } {
    if (!this.isRomLoaded()) {
      log.warn('Attempted to save state with no ROM loaded');
      throw new Error('No ROM loaded');
    }
    const resolvedPath = this.resolveStatePath(statePath);
    fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
    const state = this.emulator.saveState();
    const payload = JSON.stringify(state);
    fs.writeFileSync(resolvedPath, payload, 'utf8');
    log.info(`Saved emulator state: ${resolvedPath}`);
    return {
      path: resolvedPath,
      bytes: Buffer.byteLength(payload, 'utf8'),
      romPath: this.getRomPath()
    };
  }

  /**
   * Load a full emulator state from a JSON file and return the restored screen.
   */
  loadState(statePath: string): ImageContent {
    const resolvedPath = this.resolveStatePath(statePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`State file not found: ${resolvedPath}`);
    }
    const payload = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    this.emulator.loadState(payload);
    log.info(`Loaded emulator state: ${resolvedPath}`);
    return this.getScreen();
  }

  /**
   * Presses a GameBoy button for a single frame.
   * @param button The button to press.
   * @param durationFrames The number of frames to press the button.
   * @returns The screen content after pressing the button.
   * @throws Error if no ROM is loaded.
   */
  pressButton(button: GameBoyButton, durationFrames: number): ImageContent {
    log.debug(`Pressing button: ${button}`);
    if (!this.isRomLoaded()) {
      log.warn('Attempted to press button with no ROM loaded');
      throw new Error('No ROM loaded');
    }
    this.emulator.pressButton(button, durationFrames); // This advances one frame
    return this.getScreen();
  }

  /**
   * Waits (advances) for a specified number of frames.
   * @param durationFrames The number of frames to wait.
   * @returns The screen content after waiting.
   * @throws Error if no ROM is loaded.
   */
  waitFrames(durationFrames: number): ImageContent {
    log.debug(`Waiting for ${durationFrames} frames`);
    if (!this.isRomLoaded()) {
      log.warn('Attempted to wait frames with no ROM loaded');
      throw new Error('No ROM loaded');
    }
    for (let i = 0; i < durationFrames; i++) {
      this.emulator.doFrame();
    }
    log.verbose(`Waited ${durationFrames} frames`, JSON.stringify({ frames: durationFrames }));
    return this.getScreen();
  }

  /**
   * Gets the current GameBoy screen as base64 PNG data.
   * Does NOT advance a frame.
   * @returns The screen content.
   * @throws Error if no ROM is loaded.
   */
  getScreen(): ImageContent {
    log.verbose('Getting current screen');
    if (!this.isRomLoaded()) {
      log.warn('Attempted to get screen with no ROM loaded');
      throw new Error('No ROM loaded');
    }
    const screenBase64 = this.emulator.getScreenAsBase64();
    const screen: ImageContent = {
      type: 'image',
      data: screenBase64,
      mimeType: 'image/png'
    };
    log.verbose('Screen data retrieved', JSON.stringify({ mimeType: screen.mimeType, dataLength: screen.data.length }));
    return screen;
  }

  /**
   * Advances the emulator by one frame and returns the new screen.
   * @returns The screen content after advancing one frame.
   * @throws Error if no ROM is loaded.
   */
  advanceFrameAndGetScreen(): ImageContent {
    log.verbose('Advancing one frame and getting screen');
    if (!this.isRomLoaded()) {
      log.warn('Attempted to advance frame with no ROM loaded');
      throw new Error('No ROM loaded');
    }
    this.emulator.doFrame();
    return this.getScreen();
  }
}
