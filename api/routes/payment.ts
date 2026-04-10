import { Router, Request, Response } from 'express';
import db from '../db.js';

const router = Router();

// ==========================================
// 第三方支付对接框架 (WeChat Pay / Alipay)
// ==========================================
// 说明: 本文件提供了标准支付接入框架结构。
// 在真实环境中，你需要引入对应的 SDK（如 alipay-sdk, wechatpay-node-v3）
// 并在 createOrder 和 verifyWebhookSignature 中填入真实的商户参数。
// 当前为 Mock 实现，以供演示和流程测试使用。
// ==========================================

// Mock In-Memory Order Store for demonstration
const mockOrders = new Map<string, { userId: number, status: 'PENDING' | 'SUCCESS', method: string }>();

// 1. 创建支付订单接口 (Unified Order API)
// POST /api/payment/create
router.post('/create', async (req: Request, res: Response) => {
  try {
    const { userId, method, amount } = req.body; // 'wechat' or 'alipay'

    if (!userId || !method || !amount) {
      return res.status(400).json({ success: false, message: '缺少支付参数' });
    }

    // 生成业务订单号
    const orderId = `ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;

    // ----------------------------------------------------
    // TODO: 在这里调用真实的微信支付/支付宝统一下单接口
    // const realQrCodeUrl = await WechatPaySDK.transactions.native({
    //   description: 'Think-Class 平台激活',
    //   out_trade_no: orderId,
    //   amount: { total: amount * 100 },
    //   notify_url: 'https://your-domain.com/api/payment/notify'
    // });
    // ----------------------------------------------------

    // 模拟订单入库
    mockOrders.set(orderId, { userId, status: 'PENDING', method });

    // Mock: 自动在 5 秒后模拟用户支付成功，方便演示
    setTimeout(() => {
      if (mockOrders.has(orderId)) {
        mockOrders.set(orderId, { userId, status: 'SUCCESS', method });
        // 在真实环境中，这里应该由 webhook 回调触发，而不是定时器
        db.prepare(`UPDATE users SET is_activated = 1 WHERE id = ?`).run(userId);
      }
    }, 5000);

    return res.json({
      success: true,
      message: '订单创建成功',
      data: {
        orderId,
        qrCodeUrl: `weixin://wxpay/bizpayurl?pr=mock_qrcode_${orderId}`, // 模拟的二维码内容
        amount
      }
    });

  } catch (error) {
    console.error('Create payment order error:', error);
    res.status(500).json({ success: false, message: '支付系统异常' });
  }
});

// 2. 轮询查询支付状态接口
// GET /api/payment/status/:orderId
router.get('/status/:orderId', async (req: Request, res: Response) => {
  try {
    const userId = Number(req.query.userId);
    const orderId = req.params.orderId;

    const order = mockOrders.get(orderId);

    if (!order) {
      return res.status(404).json({ success: false, message: '订单不存在' });
    }

    if (order.userId !== userId) {
      return res.status(403).json({ success: false, message: '无权查询该订单' });
    }

    return res.json({
      success: true,
      data: {
        orderId,
        status: order.status
      }
    });

  } catch (error) {
    console.error('Check payment status error:', error);
    res.status(500).json({ success: false, message: '状态查询异常' });
  }
});

// 3. 支付网关异步回调接口 (Webhook)
// POST /api/payment/notify
router.post('/notify', async (req: Request, res: Response) => {
  try {
    // ----------------------------------------------------
    // TODO: 在真实环境中，这里必须验证签名
    // const isValid = WechatPaySDK.verifySignature(req.headers, req.body);
    // if (!isValid) return res.status(401).send('Invalid Signature');
    // ----------------------------------------------------

    const { orderId, trade_status } = req.body;

    if (trade_status === 'SUCCESS' || trade_status === 'TRADE_SUCCESS') {
      const order = mockOrders.get(orderId);
      
      if (order && order.status === 'PENDING') {
        // 更新订单状态
        order.status = 'SUCCESS';
        mockOrders.set(orderId, order);
        
        // 核心逻辑：给用户发货（解锁付费墙）
        db.prepare(`UPDATE users SET is_activated = 1 WHERE id = ?`).run(order.userId);
        
        console.log(`[Payment Webhook] Order ${orderId} paid successfully for user ${order.userId}`);
      }
    }

    // 给支付网关返回成功应答
    res.status(200).send('success'); // 支付宝
    // res.status(200).json({ code: 'SUCCESS', message: '成功' }); // 微信

  } catch (error) {
    console.error('Payment webhook error:', error);
    res.status(500).send('fail');
  }
});

export default router;
