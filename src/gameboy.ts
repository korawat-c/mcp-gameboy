import { GameBoyButton } from './types';
import * as fs from 'fs';
import * as path from 'path';
import { createCanvas, Canvas } from 'canvas';
import { log } from './utils/logger';

// Import the serverboy library
const Gameboy = require('serverboy');

export class GameBoyEmulator {
  private gameboy: any;
  private canvas: Canvas;
  private romLoaded: boolean = false;
  private romPath?: string;

  constructor() {
    this.gameboy = new Gameboy();
    // Create a canvas for rendering the screen
    this.canvas = createCanvas(160, 144);
  }

  /**
   * Load a ROM file
   * @param romPath Path to the ROM file
   */
  public loadRom(romPath: string): void {
    try {
      const rom = fs.readFileSync(romPath);
      this.gameboy.loadRom(rom);
      this.romLoaded = true;
      this.romPath = romPath;
      log.info(`ROM loaded: ${path.basename(romPath)}`);
    } catch (error) {
      log.error(`Error loading ROM: ${error}`);
      throw new Error(`Failed to load ROM: ${error}`);
    }
  }

  private getServerboyCore(): any {
    const privateKey = Object.getOwnPropertyNames(this.gameboy).find((key) => {
      const value = this.gameboy[key];
      return value && typeof value === 'object' && value.gameboy;
    });
    if (!privateKey) {
      throw new Error('Unable to access emulator core state');
    }
    const core = this.gameboy[privateKey].gameboy;
    if (!core || typeof core.saveState !== 'function' || typeof core.saving !== 'function') {
      throw new Error('Emulator core does not support save-state operations');
    }
    return core;
  }

  private getServerboyInterfaceState(): any {
    const privateKey = Object.getOwnPropertyNames(this.gameboy).find((key) => {
      const value = this.gameboy[key];
      return value && typeof value === 'object' && value.gameboy;
    });
    return privateKey ? this.gameboy[privateKey] : null;
  }

  /**
   * Capture the full emulator state for deterministic curriculum restarts.
   */
  public saveState(): Record<string, unknown> {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }
    const core = this.getServerboyCore();
    const interfaceState = this.getServerboyInterfaceState();
    return {
      schema: 'mcp_gameboy.state.v1',
      romPath: this.romPath,
      frames: interfaceState?.frames ?? null,
      pressed: Array.isArray(interfaceState?.pressed) ? interfaceState.pressed.slice(0) : [],
      currentScreen: Array.isArray(core.currentScreen) ? core.currentScreen.slice(0) : [],
      currentScreenFixed: Array.isArray(core.currentScreenFixed) ? core.currentScreenFixed.slice(0) : [],
      partialScreen: Array.isArray(core.partialScreen) ? core.partialScreen.slice(0) : [],
      state: core.saveState()
    };
  }

  /**
   * Restore a full emulator state captured by saveState().
   */
  public loadState(savedState: Record<string, unknown>): void {
    const state = savedState.state;
    if (!Array.isArray(state)) {
      throw new Error('Invalid save-state payload');
    }
    const savedRomPath = typeof savedState.romPath === 'string' ? savedState.romPath : undefined;
    if (!this.romLoaded) {
      if (!savedRomPath) {
        throw new Error('No ROM loaded and save-state does not include a ROM path');
      }
      this.loadRom(savedRomPath);
    }
    const core = this.getServerboyCore();
    core.saving(state);
    if (Array.isArray(savedState.currentScreen)) {
      core.currentScreen = savedState.currentScreen.slice(0);
    }
    if (Array.isArray(savedState.currentScreenFixed)) {
      core.currentScreenFixed = savedState.currentScreenFixed.slice(0);
      core.lastScreen = core.currentScreenFixed;
    }
    if (Array.isArray(savedState.partialScreen)) {
      core.partialScreen = savedState.partialScreen.slice(0);
    }
    const interfaceState = this.getServerboyInterfaceState();
    if (interfaceState) {
      interfaceState.frames = typeof savedState.frames === 'number' ? savedState.frames : interfaceState.frames;
      interfaceState.pressed = Array.isArray(savedState.pressed)
        ? savedState.pressed.slice(0)
        : new Array(interfaceState.pressed?.length ?? 8);
    }
    this.romPath = savedRomPath || this.romPath;
    this.romLoaded = true;
  }

  /**
   * Press a button on the GameBoy
   * @param button Button to press
   */
  public pressButton(button: GameBoyButton, durationFrames: number = 1): void {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }

    // Map our button enum to serverboy's keymap
    const buttonMap: Record<GameBoyButton, number> = {
      [GameBoyButton.UP]: Gameboy.KEYMAP.UP,
      [GameBoyButton.DOWN]: Gameboy.KEYMAP.DOWN,
      [GameBoyButton.LEFT]: Gameboy.KEYMAP.LEFT,
      [GameBoyButton.RIGHT]: Gameboy.KEYMAP.RIGHT,
      [GameBoyButton.A]: Gameboy.KEYMAP.A,
      [GameBoyButton.B]: Gameboy.KEYMAP.B,
      [GameBoyButton.START]: Gameboy.KEYMAP.START,
      [GameBoyButton.SELECT]: Gameboy.KEYMAP.SELECT
    };

    for (let i=0; i < durationFrames; i++) {
      this.gameboy.pressKeys([buttonMap[button]]);
      this.gameboy.doFrame();
    }

    // for now: advance one frame so we dont "hold" the button all the time.
    this.gameboy.doFrame();
  }

  /**
   * Advance the emulation by one frame
   */
  public doFrame(): void {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }
    this.gameboy.doFrame();
  }

  /**
   * Get the current screen as a base64 encoded PNG
   * @returns Base64 encoded PNG image
   */
  public getScreenAsBase64(): string {
    if (!this.romLoaded) {
      throw new Error('No ROM loaded');
    }

    // Get the raw screen data
    const screenData = this.gameboy.getScreen();
    
    // Draw to canvas
    const ctx = this.canvas.getContext('2d');
    const imageData = ctx.createImageData(160, 144);
    
    for (let i = 0; i < screenData.length; i++) {
      imageData.data[i] = screenData[i];
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    // Convert to base64 PNG
    return this.canvas.toDataURL('image/png').split(',')[1];
  }

  /**
   * Get the current ROM path
   * @returns Current ROM path or undefined if no ROM is loaded
   */
  public getRomPath(): string | undefined {
    return this.romPath;
  }

  /**
   * Check if a ROM is loaded
   * @returns True if a ROM is loaded, false otherwise
   */
  public isRomLoaded(): boolean {
    return this.romLoaded;
  }
}
