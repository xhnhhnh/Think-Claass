# 第二批页面对接矩阵

## 说明
- 范围：Student + Teacher + Parent（不含 Admin/Home）
- 标记：`完成` / `进行中` / `待处理`

## Student
| 页面 | 前端 API 模块 | 后端路由 | 状态 |
| --- | --- | --- | --- |
| Pet | `pet.ts` | `api/routes/pet.ts` | 完成 |
| Shop | `shop.ts` | `api/routes/shop.ts` | 完成 |
| Bank | `economy.ts` | `api/routes/economy.ts` | 完成 |
| LuckyDraw | `luckyDraw.ts` | `api/routes/lucky_draw.ts` | 完成 |
| Dungeon | `dungeon.ts` | `api/routes/dungeon.ts` | 待处理 |
| Auction | `auction.ts` | `api/routes/auction.ts` | 待处理 |
| PeerReview | `messages.ts`/`students.ts` | `api/routes/messages.ts` | 待处理 |
| MyRedemptions | `redemption.ts` | `api/routes/redemption.ts` | 待处理 |
| Certificates | `certificates.ts` | `api/routes/certificates.ts` | 待处理 |
| InteractiveWall | `messages.ts` | `api/routes/messages.ts` | 待处理 |
| Achievements | `analytics.ts` | `api/routes/analytics.ts` | 待处理 |

## Teacher
| 页面 | 前端 API 模块 | 后端路由 | 状态 |
| --- | --- | --- | --- |
| Shop | `shop.ts` | `api/routes/shop.ts` | 完成 |
| Pets | `pet.ts` | `api/routes/pet.ts` | 完成 |
| WorldBoss | `challenge.ts`/`worldBoss.ts` | `api/routes/challenge.ts`/`api/routes/worldBoss.ts` | 完成 |
| LuckyDrawConfig | `luckyDraw.ts` | `api/routes/lucky_draw.ts` | 完成 |
| Verification | `redemption.ts` | `api/routes/redemption.ts` | 完成 |
| Records | `students.ts` | `api/routes/students.ts` | 待处理 |
| Communication | `messages.ts` | `api/routes/messages.ts` | 待处理 |
| Certificates | `certificates.ts` | `api/routes/certificates.ts` | 待处理 |
| AddStudent | `students.ts` | `api/routes/students.ts` | 待处理 |
| Auction | `auction.ts` | `api/routes/auction.ts` | 待处理 |
| BlindBox | `shop.ts`/`luckyDraw.ts` | `api/routes/shop.ts`/`api/routes/lucky_draw.ts` | 待处理 |
| Bigscreen | `analytics.ts` | `api/routes/analytics.ts` | 待处理 |
| Tools | `teacher.ts` | `api/routes/teacher.ts` | 待处理 |

## Parent
| 页面 | 前端 API 模块 | 后端路由 | 状态 |
| --- | --- | --- | --- |
| Dashboard | `parentDashboard.ts` | `students.ts`/`familyTasks.ts`/`pet.ts`/`parentBuff.ts` | 完成 |
| Communication | `messages.ts` | `api/routes/messages.ts` | 完成 |
| Tasks | `familyTasks.ts` | `api/routes/familyTasks.ts` | 完成 |
| Report | `analytics.ts` | `api/routes/analytics.ts` | 保持现状 |
