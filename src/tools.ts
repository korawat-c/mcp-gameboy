import { 
  CallToolResult,
  ImageContent,
  TextContent
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { GameBoyButton } from './types';
import { EmulatorService } from './emulatorService'; // Import EmulatorService
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as fs from 'fs';
import * as path from 'path';
import { log } from './utils/logger';

type ToolInputSchema = Record<string, z.ZodTypeAny>;
type RegisterTool = (
  name: string,
  config: {
    description?: string;
    inputSchema?: ToolInputSchema;
  },
  cb: (...args: any[]) => CallToolResult | Promise<CallToolResult>
) => void;

const pressButtonInputSchema: ToolInputSchema = {
  duration_frames: z.number().int().positive().describe('Number of frames to hold the button').default(25)
};

const waitFramesInputSchema: ToolInputSchema = {
  duration_frames: z.number().int().positive().describe('Number of frames to wait').default(100)
};

const loadRomInputSchema: ToolInputSchema = {
  romPath: z.string().describe('Path to the ROM file')
};

const statePathInputSchema: ToolInputSchema = {
  statePath: z.string().describe('Path to the emulator state JSON file')
};

/**
 * Register GameBoy tools with the MCP server
 * @param server MCP server instance
 * @param emulatorService Emulator service instance
 */
export function registerGameBoyTools(server: McpServer, emulatorService: EmulatorService): void {
  const registerTool = server.registerTool.bind(server) as RegisterTool;

  // Register button press tools
  Object.values(GameBoyButton).forEach(button => {
    registerTool(
      `press_${button.toLowerCase()}`,
      {
        description: `Press the ${button} button on the GameBoy`,
        inputSchema: pressButtonInputSchema
      },
      async (args): Promise<CallToolResult> => {
        const { duration_frames } = args as { duration_frames: number };

        // Press the button using the service (advances one frame)
        emulatorService.pressButton(button, duration_frames);

        // Return the current screen using the service
        const screen = emulatorService.getScreen();
        return { content: [screen] };
      }
    );
  });

  // Register wait_frames tool
  registerTool(
    'wait_frames',
    {
      description: 'Wait for a specified number of frames',
      inputSchema: waitFramesInputSchema
    },
    async (args): Promise<CallToolResult> => {
      const { duration_frames } = args as { duration_frames: number };

      // Wait for frames using the service
      const screen = emulatorService.waitFrames(duration_frames);
      return { content: [screen] };
    }
  );

  // Register load ROM tool
  registerTool(
    'load_rom',
    {
      description: 'Load a GameBoy ROM file',
      inputSchema: loadRomInputSchema
    },
    async (args): Promise<CallToolResult> => {
      const { romPath } = args as { romPath: string };

      // Load ROM using the service (already advances initial frames)
      const screen = emulatorService.loadRom(romPath);
      return { content: [screen] };
    }
  );

  // Register get screen tool
  registerTool(
    'get_screen',
    {
      description: 'Get the current GameBoy screen (advances one frame)'
    },
    async (): Promise<CallToolResult> => {
      // Advance one frame and get the screen using the service
      const screen = emulatorService.advanceFrameAndGetScreen();
      return { content: [screen] };
    }
  );

  // Register save state tool
  registerTool(
    'save_state',
    {
      description: 'Save the current emulator state to a JSON file',
      inputSchema: statePathInputSchema
    },
    async (args): Promise<CallToolResult> => {
      const { statePath } = args as { statePath: string };
      const saved = emulatorService.saveState(statePath);
      const responseText: TextContent = {
        type: 'text',
        text: JSON.stringify(saved)
      };
      return { content: [responseText] };
    }
  );

  // Register load state tool
  registerTool(
    'load_state',
    {
      description: 'Load an emulator state from a JSON file',
      inputSchema: statePathInputSchema
    },
    async (args): Promise<CallToolResult> => {
      const { statePath } = args as { statePath: string };
      const screen = emulatorService.loadState(statePath);
      return { content: [screen] };
    }
  );

  // Register is_rom_loaded tool
  registerTool(
    'is_rom_loaded',
    {
      description: 'Check if a ROM is currently loaded in the emulator'
    },
    async (): Promise<CallToolResult> => {
      const isLoaded = emulatorService.isRomLoaded();
      const romPath = emulatorService.getRomPath();
      
      const responseText: TextContent = {
        type: 'text',
        text: JSON.stringify({
          romLoaded: isLoaded,
          romPath: romPath || null
        })
      };
      
      log.verbose('Checked ROM loaded status', JSON.stringify({ 
        romLoaded: isLoaded, 
        romPath: romPath || null 
      }));
      
      return { content: [responseText] };
    }
  );

  // Register list_roms tool
  registerTool(
    'list_roms',
    {
      description: 'List all available GameBoy ROM files'
    },
    async (): Promise<CallToolResult> => {
      try {
        const romsDir = path.join(process.cwd(), 'roms');
        
        // Create roms directory if it doesn't exist
        if (!fs.existsSync(romsDir)) {
          fs.mkdirSync(romsDir);
          log.info('Created roms directory');
        }
        
        // Get list of ROM files
        const romFiles = fs.readdirSync(romsDir)
          .filter(file => file.endsWith('.gb') || file.endsWith('.gbc'))
          .map(file => ({
            name: file,
            path: path.join(romsDir, file)
          }));
        
        const responseText: TextContent = {
          type: 'text',
          text: JSON.stringify(romFiles)
        };
        
        log.verbose('Listed available ROMs', JSON.stringify({ 
          count: romFiles.length, 
          roms: romFiles 
        }));
        
        return { content: [responseText] };
      } catch (error) {
        log.error('Error listing ROMs:', error instanceof Error ? error.message : String(error));
        
        const errorText: TextContent = {
          type: 'text',
          text: JSON.stringify({
            error: 'Failed to list ROMs',
            message: error instanceof Error ? error.message : String(error)
          })
        };
        
        return { content: [errorText] };
      }
    }
  );
}
