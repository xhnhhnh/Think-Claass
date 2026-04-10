import { Request, Response, NextFunction } from 'express';
import { logOperation } from './logger.js';

export function operationLogger(req: Request, res: Response, next: NextFunction) {
  // Capture original send
  const originalSend = res.json;

  res.json = function (body) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      const method = req.method;
      const path = req.baseUrl + req.path;
      
      // Define key operations to log
      if (method !== 'GET') {
        let action = '';
        let details = '';

        if (path.includes('/api/students/batch-points')) {
          action = '批量加/扣分';
          details = `操作人数: ${req.body.studentIds?.length}, 分数: ${req.body.amount}, 理由: ${req.body.reason}`;
        } else if (path.match(/\/api\/students\/\d+\/points/)) {
          action = '单个加/扣分';
          details = `学生ID: ${req.params.id}, 分数: ${req.body.amount}, 理由: ${req.body.reason}`;
        } else if (path.includes('/api/shop') && method === 'POST') {
          action = '添加商品';
          details = `商品名称: ${req.body.name}, 价格: ${req.body.price}`;
        } else if (path.includes('/api/classes') && method === 'POST') {
          action = '创建班级';
          details = `班级名称: ${req.body.name}`;
        } else if (path.match(/\/api\/shop\/\d+\/status/)) {
          action = '更新商品状态';
          details = `商品ID: ${req.params.id}, 状态: ${req.body.is_active ? '上架' : '下架'}`;
        }

        if (action) {
          // In a real app we'd get teacherId from session/token. Here we mock it as 1.
          const teacherId = req.body.teacherId || req.query.teacherId || 1;
          const ip = req.ip || req.connection.remoteAddress || '';
          logOperation(Number(teacherId), action, details, ip);
        }
      }
    }
    return originalSend.call(this, body);
  };

  next();
}
