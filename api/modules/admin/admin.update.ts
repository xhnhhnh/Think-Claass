import { Controller, Get, HttpCode, HttpStatus, Inject, Injectable, Post, Query, Req } from '@nestjs/common';
import { spawn } from 'child_process';
import type { Request } from 'express';
import { access, appendFile, mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';

import type {
  ApiSuccessResponse,
  ReleaseUpdateStatus,
  ReleaseUpdateState,
} from '../../../src/shared/admin/contracts.js';
import { ApiError } from '../../utils/apiError.js';
import { requireActorRole } from '../../utils/requestAuth.js';
import { throwAdminError } from './admin.errors.js';

const DEFAULT_REPO = 'xhnhhnh/Think-Claass';
const DEFAULT_ASSET_NAME = 'think-class-release.zip';
const MAX_LOG_LINES = 500;

interface StoredUpdateStatus {
  state: ReleaseUpdateState;
  message: string;
  currentVersion?: string;
  latestVersion?: string;
  startedAt?: string | null;
  updatedAt?: string | null;
  logFile?: string;
  platform?: string;
  pid?: number | null;
}

interface LatestRelease {
  latestVersion: string;
  releaseUrl: string;
  downloadUrl: string;
}

function ok<T>(data: T, message?: string): ApiSuccessResponse<T> {
  return message ? { success: true, data, message } : { success: true, data };
}

function normalizeVersion(version: string | undefined | null) {
  return String(version ?? '').trim().replace(/^v/i, '');
}

function compareVersions(left: string, right: string) {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

@Injectable()
export class ReleaseUpdateService {
  private get rootDir() {
    return path.resolve(process.env.THINK_CLASS_ROOT || process.cwd());
  }

  private get repo() {
    return process.env.THINK_CLASS_RELEASE_REPO || DEFAULT_REPO;
  }

  private get assetName() {
    return process.env.THINK_CLASS_RELEASE_ASSET || DEFAULT_ASSET_NAME;
  }

  private get logsDir() {
    return path.join(this.rootDir, 'logs');
  }

  private get logFile() {
    return path.join(this.logsDir, 'update.log');
  }

  private get statusFile() {
    return path.join(this.logsDir, 'update-status.json');
  }

  private get updateScript() {
    return path.join(this.rootDir, 'update.sh');
  }

  async getStatus(lines = 200): Promise<ReleaseUpdateStatus> {
    let stored = await this.readStoredStatus();

    if (stored.state === 'running' && stored.pid && !this.isProcessAlive(stored.pid)) {
      stored = {
        ...stored,
        state: 'failed',
        message: '更新进程已意外结束，请查看日志后重试。',
        updatedAt: new Date().toISOString(),
      };
      await this.writeStoredStatus(stored);
    }

    const currentVersion = await this.readCurrentVersion();
    const latestVersion = stored.latestVersion || '';

    return {
      repo: this.repo,
      supported: process.platform === 'linux',
      platform: process.platform,
      state: stored.state,
      message: stored.message,
      currentVersion,
      latestVersion,
      hasUpdate: latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : null,
      releaseUrl: latestVersion
        ? `https://github.com/${this.repo}/releases/tag/${encodeURIComponent(latestVersion)}`
        : `https://github.com/${this.repo}/releases/latest`,
      downloadUrl: `https://github.com/${this.repo}/releases/latest/download/${this.assetName}`,
      startedAt: stored.startedAt ?? null,
      updatedAt: stored.updatedAt ?? null,
      log: await this.readLogTail(lines),
    };
  }

  async checkLatest(lines = 200): Promise<ReleaseUpdateStatus> {
    const latest = await this.resolveLatestRelease();
    const stored = await this.readStoredStatus();
    await this.writeStoredStatus({
      ...stored,
      latestVersion: latest.latestVersion,
      updatedAt: new Date().toISOString(),
      message: stored.state === 'running' ? stored.message : '已获取 GitHub Release 最新版本。',
    });

    return {
      ...(await this.getStatus(lines)),
      releaseUrl: latest.releaseUrl,
      downloadUrl: latest.downloadUrl,
    };
  }

  async startUpdate(): Promise<ReleaseUpdateStatus> {
    if (process.platform !== 'linux') {
      throw new ApiError(400, `网站内更新目前仅支持 Linux，当前系统为 ${process.platform}。`);
    }

    await access(this.updateScript);
    const status = await this.getStatus();
    if (status.state === 'running') {
      throw new ApiError(409, '已有更新任务正在运行，请稍后刷新日志。');
    }

    const latest = await this.resolveLatestRelease();
    const currentVersion = await this.readCurrentVersion();
    if (compareVersions(latest.latestVersion, currentVersion) <= 0) {
      await this.writeStoredStatus({
        state: 'succeeded',
        message: `当前已是最新版本 ${latest.latestVersion}。`,
        currentVersion,
        latestVersion: latest.latestVersion,
        startedAt: null,
        updatedAt: new Date().toISOString(),
        platform: process.platform,
      });
      return this.getStatus();
    }

    await mkdir(this.logsDir, { recursive: true });
    await this.appendLog(`网站后台请求更新：${currentVersion} -> ${latest.latestVersion}`);

    const startedAt = new Date().toISOString();
    const child = spawn('bash', [this.updateScript], {
      cwd: this.rootDir,
      detached: true,
      env: {
        ...process.env,
        UPDATE_LOG_DIR: this.logsDir,
        UPDATE_LOG_FILE: this.logFile,
        UPDATE_STATUS_FILE: this.statusFile,
      },
      stdio: 'ignore',
    });

    const runningStatus: StoredUpdateStatus = {
      state: 'running',
      message: `正在更新到 ${latest.latestVersion}，请留意日志。`,
      currentVersion,
      latestVersion: latest.latestVersion,
      startedAt,
      updatedAt: startedAt,
      logFile: this.logFile,
      platform: process.platform,
      pid: child.pid ?? null,
    };
    await this.writeStoredStatus(runningStatus);

    child.once('error', async (error) => {
      await this.appendLog(`无法启动 Linux 更新脚本：${error.message}`);
      await this.writeStoredStatus({
        ...runningStatus,
        state: 'failed',
        message: '无法启动 Linux 更新脚本，请查看日志。',
        updatedAt: new Date().toISOString(),
      });
    });
    child.unref();

    return this.getStatus();
  }

  private async resolveLatestRelease(): Promise<LatestRelease> {
    const latestUrl = `https://github.com/${this.repo}/releases/latest`;
    let latestVersion = '';

    try {
      const response = await fetch(latestUrl, {
        method: 'HEAD',
        redirect: 'manual',
        headers: { 'User-Agent': 'Think-Class-Updater' },
        signal: AbortSignal.timeout(10_000),
      });
      latestVersion = this.extractTag(response.headers.get('location') || response.url);
    } catch {
      // The REST fallback below gives a more useful final error.
    }

    if (!latestVersion) {
      const headers: Record<string, string> = {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'Think-Class-Updater',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

      try {
        const response = await fetch(`https://api.github.com/repos/${this.repo}/releases/latest`, {
          headers,
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok) throw new Error(`GitHub API ${response.status}`);
        const payload = (await response.json()) as { tag_name?: string };
        latestVersion = payload.tag_name || '';
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new ApiError(502, `无法获取 GitHub 最新 Release：${reason}`);
      }
    }

    if (!latestVersion) {
      throw new ApiError(502, 'GitHub 最新 Release 缺少版本标签。');
    }

    return {
      latestVersion,
      releaseUrl: `https://github.com/${this.repo}/releases/tag/${encodeURIComponent(latestVersion)}`,
      downloadUrl: `https://github.com/${this.repo}/releases/latest/download/${this.assetName}`,
    };
  }

  private extractTag(url: string) {
    const match = url.match(/\/releases\/tag\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  private async readCurrentVersion() {
    if (process.env.CURRENT_VERSION) return process.env.CURRENT_VERSION;

    try {
      const env = await readFile(path.join(this.rootDir, '.env'), 'utf8');
      const match = env.match(/^CURRENT_VERSION=(.+)$/m);
      if (match?.[1]) return match[1].trim().replace(/^["']|["']$/g, '');
    } catch {
      // package.json is the source-tree fallback.
    }

    try {
      const packageJson = JSON.parse(await readFile(path.join(this.rootDir, 'package.json'), 'utf8')) as {
        version?: string;
      };
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  private async readStoredStatus(): Promise<StoredUpdateStatus> {
    try {
      return JSON.parse(await readFile(this.statusFile, 'utf8')) as StoredUpdateStatus;
    } catch {
      return {
        state: 'idle',
        message: '尚未执行网站更新。',
        updatedAt: null,
      };
    }
  }

  private async writeStoredStatus(status: StoredUpdateStatus) {
    await mkdir(this.logsDir, { recursive: true });
    await writeFile(this.statusFile, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  }

  private async readLogTail(lines: number) {
    const limit = Math.min(Math.max(Number(lines) || 200, 1), MAX_LOG_LINES);
    try {
      const content = await readFile(this.logFile, 'utf8');
      return content.trimEnd().split(/\r?\n/).slice(-limit).join('\n');
    } catch {
      return '';
    }
  }

  private async appendLog(message: string) {
    await mkdir(this.logsDir, { recursive: true });
    await appendFile(this.logFile, `[${new Date().toISOString()}] >> ${message}\n`, 'utf8');
  }

  private isProcessAlive(pid: number) {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }
}

@Controller('api/admin/system/update')
export class AdminUpdateController {
  constructor(@Inject(ReleaseUpdateService) private readonly releaseUpdateService: ReleaseUpdateService) {}

  @Get('status')
  async getStatus(@Req() req: Request, @Query('lines') lines?: string) {
    try {
      requireActorRole(req, ['superadmin']);
      return ok(await this.releaseUpdateService.getStatus(Number(lines) || 200));
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Get('check')
  async checkLatest(@Req() req: Request, @Query('lines') lines?: string) {
    try {
      requireActorRole(req, ['superadmin']);
      return ok(await this.releaseUpdateService.checkLatest(Number(lines) || 200));
    } catch (error) {
      throwAdminError(error);
    }
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async startUpdate(@Req() req: Request) {
    try {
      requireActorRole(req, ['superadmin']);
      const status = await this.releaseUpdateService.startUpdate();
      return ok(status, status.message);
    } catch (error) {
      throwAdminError(error);
    }
  }
}
