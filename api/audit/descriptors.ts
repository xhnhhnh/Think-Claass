/**
 * Audit descriptors.
 *
 * These four operations were the only ones the baseline ever audited, because
 * `api/utils/logMiddleware.ts` contained a hardcoded if/else chain naming them -
 * everything else was silently not recorded, and no module could add an entry.
 *
 * The same coverage is now expressed as data. Adding a descriptor here (or from a
 * plugin, once routes are plugin-owned) requires no change to the middleware, and
 * which operations are audited is readable in one place instead of reconstructed
 * from branch conditions.
 *
 * `owner` records who declared a descriptor so a plugin's entries can be attributed.
 */

import type { AuditDescriptor } from '@thinkclass/kernel';

export const CORE_AUDIT_DESCRIPTORS: AuditDescriptor[] = [
  {
    method: 'POST',
    pattern: '/api/students/batch-points',
    action: '批量加/扣分',
    // `{{studentIds}}` renders an array as its length.
    detail: '操作人数: {{studentIds}}, 分数: {{amount}}, 理由: {{reason}}',
  },
  {
    method: 'POST',
    pattern: '/api/students/:id/points',
    action: '单个加/扣分',
    detail: '学生ID: {{id}}, 分数: {{amount}}, 理由: {{reason}}',
  },
  {
    method: 'POST',
    pattern: '/api/shop',
    action: '添加商品',
    detail: '商品名称: {{name}}, 价格: {{price}}',
  },
  {
    method: 'POST',
    pattern: '/api/classes',
    action: '创建班级',
    detail: '班级名称: {{name}}',
  },
  {
    method: 'POST',
    pattern: '/api/shop/:id/status',
    action: '更新商品状态',
    detail: '商品ID: {{id}}, 状态: {{is_active?上架:下架}}',
  },
  {
    method: 'PUT',
    pattern: '/api/shop/:id/status',
    action: '更新商品状态',
    detail: '商品ID: {{id}}, 状态: {{is_active?上架:下架}}',
  },
];

/** Owner label for attributing entries produced by the core descriptors. */
export const CORE_AUDIT_OWNER = 'core';
