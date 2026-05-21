# 植物情感陪伴桌面小组件开发维护文档

## 1. 项目目标

当前 MVP 只做一条最小数据闭环：

```text
传感器/模拟数据上传
-> 后端接收并校验
-> 后端判断植物 state 和 event_type
-> 数据库存储
-> Electron 桌面端读取最新状态
-> 小组件切换动画和气泡反馈
```

当前阶段不做 AI 聊天、不做用户系统、不做成长日历、不做复杂后台、不做历史图表。

## 2. 当前技术栈

- Electron + HTML/CSS/JavaScript：桌面小组件。
- Supabase PostgreSQL：保存传感器 reading、状态和事件。
- Supabase Edge Functions：提供 HTTP API。
- Deno/TypeScript：Supabase Edge Functions 运行环境。
- Node.js：运行 `scripts/simulate-device.js`，模拟 ESP32 上传。
- ESP32：后续真实硬件通过 HTTP POST 上传同样 JSON。

## 3. 整体数据链路

```text
scripts/simulate-device.js / ESP32
        |
        | POST /api/device-data
        | Supabase 实际路径: /functions/v1/device-data
        v
Supabase Edge Function API Handler
        v
sensorService
        v
plantStateService.evaluatePlantState()
        v
sensorRepository
        v
Supabase PostgreSQL plant_readings
        ^
        |
GET /api/latest-data
Supabase 实际路径: /functions/v1/latest-data
        |
Electron services/plantApi.js
        |
state 控制动画，event_type 控制气泡
```

`/api/device-data` 和 `/api/latest-data` 是语义接口名。当前使用 Supabase Edge Functions 时，真实访问地址是：

```text
https://<project-ref>.supabase.co/functions/v1/device-data
https://<project-ref>.supabase.co/functions/v1/latest-data
```

未来迁移到腾讯云、阿里云或自建 Node.js 服务时，应尽量保持语义接口和 JSON 字段不变。

## 4. 文件结构说明

```text
supabase/
  migrations/
    001_create_plant_readings.sql
  functions/
    device-data/
      index.ts
    latest-data/
      index.ts
    shared/
      config/
        plantThresholds.ts
      repositories/
        sensorRepository.ts
      services/
        plantStateService.ts
        sensorService.ts
      utils/
        response.ts
        validation.ts
      types.ts
scripts/
  simulate-device.js
services/
  plantApi.js
DEVELOPMENT_GUIDE.md
```

主要职责：

- `supabase/migrations/001_create_plant_readings.sql`：建表 SQL 和索引。
- `supabase/functions/device-data/index.ts`：上传设备数据 API 入口。
- `supabase/functions/latest-data/index.ts`：读取最新数据 API 入口。
- `supabase/functions/shared/config/plantThresholds.ts`：阈值和有效设备配置。
- `supabase/functions/shared/services/plantStateService.ts`：状态机规则。
- `supabase/functions/shared/services/sensorService.ts`：上传和读取流程编排。
- `supabase/functions/shared/repositories/sensorRepository.ts`：所有 Supabase 数据库读写。
- `supabase/functions/shared/utils/response.ts`：统一响应、错误和 CORS。
- `supabase/functions/shared/utils/validation.ts`：请求字段校验和设备 ID 校验。
- `scripts/simulate-device.js`：模拟硬件上传脚本。
- `services/plantApi.js`：Electron 前端读取后端数据的统一 data service 示例。

## 5. 数据库表说明

核心表：`plant_readings`

字段：

- `id`：uuid 主键。
- `device_id`：设备编号，必填。
- `plant_id`：植物编号，第一版可固定为 `plant_001`。
- `soil_moisture`：土壤湿度，按 0-100 处理。
- `temperature`：温度，单位摄氏度。
- `light`：光照数值，第一版普通 number。
- `air_humidity`：空气湿度。
- `battery`：电量。
- `trigger_type`：上传触发原因。
- `state`：后端判断出的植物健康状态。
- `event_type`：本次 reading 应触发的反馈事件。
- `raw_payload`：原始上传 JSON，方便调试。
- `created_at`：写入时间，默认 `now()`。

索引：

- `(device_id, created_at desc)`：按设备读取最新数据。
- `(plant_id, created_at desc)`：按植物读取最新数据。
- `(created_at desc)`：按时间调试或管理。

建表 SQL 在：

```text
supabase/migrations/001_create_plant_readings.sql
```

## 6. API 文档

### POST /api/device-data

Supabase 实际路径：

```text
POST https://<project-ref>.supabase.co/functions/v1/device-data
```

请求示例：

```json
{
  "device_id": "sensor_001",
  "plant_id": "plant_001",
  "soil_moisture": 25,
  "temperature": 28,
  "light": 350,
  "air_humidity": 55,
  "battery": 87,
  "trigger_type": "periodic"
}
```

成功返回示例：

```json
{
  "device_id": "sensor_001",
  "plant_id": "plant_001",
  "reading_id": "xxx",
  "sensor_data": {
    "soil_moisture": 25,
    "temperature": 28,
    "light": 350,
    "air_humidity": 55,
    "battery": 87
  },
  "state": "thirsty",
  "event_type": "thirsty_warning",
  "trigger_type": "periodic",
  "created_at": "2026-05-21T10:30:00Z"
}
```

错误返回示例：

```json
{
  "error": {
    "message": "soil_moisture is required and must be a number",
    "details": null
  }
}
```

### GET /api/latest-data

Supabase 实际路径：

```text
GET https://<project-ref>.supabase.co/functions/v1/latest-data?device_id=sensor_001
GET https://<project-ref>.supabase.co/functions/v1/latest-data?plant_id=plant_001
```

成功返回示例：

```json
{
  "device_id": "sensor_001",
  "plant_id": "plant_001",
  "reading_id": "xxx",
  "sensor_data": {
    "soil_moisture": 55,
    "temperature": 28,
    "light": 350,
    "air_humidity": 60,
    "battery": 87
  },
  "state": "normal",
  "event_type": "recovered",
  "trigger_type": "moisture_changed",
  "created_at": "2026-05-21T10:30:00Z"
}
```

## 7. 状态机规则

状态机文件：

```text
supabase/functions/shared/services/plantStateService.ts
```

阈值配置文件：

```text
supabase/functions/shared/config/plantThresholds.ts
```

当前 state：

- `normal`：正常。
- `thirsty`：缺水。
- `hot`：太热。
- `unknown`：数据异常或无法判断。

当前 event_type：

- `normal_update`：普通同步。
- `thirsty_warning`：缺水提醒。
- `hot_warning`：太热提醒。
- `recovered`：从异常恢复正常。
- `touched`：用户触摸硬件。
- `unknown`：数据异常或无法判断。

state 判断：

1. 如果 `soil_moisture` 或 `temperature` 缺失，返回 `unknown`。
2. 如果 `soil_moisture < 30`，返回 `thirsty`。
3. 否则如果 `temperature > 32`，返回 `hot`。
4. 否则返回 `normal`。

状态优先级：

```text
thirsty > hot > normal
```

event_type 判断：

1. 先根据传感器数据算当前 `state`。
2. 如果 `trigger_type = touched`，返回 `touched`。
3. 如果上一条 reading 是 `thirsty` 或 `hot`，当前 `state = normal`，返回 `recovered`。
4. 当前 `state = thirsty`，返回 `thirsty_warning`。
5. 当前 `state = hot`，返回 `hot_warning`。
6. 当前 `state = normal`，返回 `normal_update`。
7. 其他情况返回 `unknown`。

注意：`state` 是植物当前健康状态，`event_type` 是这次数据应该触发什么反馈。两者不要混用。

## 8. 前后端状态边界

后端负责：

- 权威健康状态 `state`。
- 权威反馈事件 `event_type`。
- 设备数据校验。
- 设备 ID MVP 鉴权。
- 数据库存储。

前端负责：

- 展示状态，例如 `dragging`、`sleeping`、`clicked`。
- 根据 `state` 切换动画。
- 根据 `event_type` 选择气泡文案。
- 根据 `reading_id` 避免同一条数据重复弹气泡。

前端可以保留 fallback 判断，例如 `decidePlantStateFallback(sensorData)`，但正常业务应以后端返回的 `state` 和 `event_type` 为准。

## 9. 模拟硬件测试方式

脚本：

```text
scripts/simulate-device.js
```

环境变量：

```powershell
$env:DEVICE_DATA_API_URL="https://<project-ref>.supabase.co/functions/v1/device-data"
$env:SUPABASE_ANON_KEY="<anon-key>"
```

如果不设置 `DEVICE_DATA_API_URL`，脚本默认请求本地 Supabase：

```text
http://127.0.0.1:54321/functions/v1/device-data
```

运行：

```powershell
npm run simulate:device normal
npm run simulate:device thirsty
npm run simulate:device hot
npm run simulate:device recovered
npm run simulate:device touched
npm run simulate:device all
```

测试预期：

- `normal`：`state = normal`，`event_type = normal_update`。
- `thirsty`：`state = thirsty`，`event_type = thirsty_warning`。
- `hot`：`state = hot`，`event_type = hot_warning`。
- `recovered`：先上传缺水，再上传正常，第二条应返回 `event_type = recovered`。
- `touched`：返回 `event_type = touched`。

## 10. Electron 对接方式

统一 data service 示例：

```text
services/plantApi.js
```

核心函数：

- `getLatestSensorData(deviceId)`
- `getPlantStatus(deviceId)`
- `decidePlantStateFallback(sensorData)`

建议轮询逻辑：

```js
import { getPlantStatus } from "./services/plantApi.js";

let lastReadingId = null;

async function pollPlantStatus() {
  const status = await getPlantStatus("sensor_001");

  setPlantState(status.state);

  if (status.reading_id !== lastReadingId) {
    lastReadingId = status.reading_id;
    showBubbleByEventType(status.event_type, status.sensor_data);
  }
}

setInterval(pollPlantStatus, 3000);
```

不要在 Electron 组件里散落 `fetch` 或 Supabase 查询。前端统一走 `plantApi.js`。

## 11. 未来迁移说明

如果 Supabase 在网络或部署上不稳定，迁移原则：

1. 保持接口语义不变：

```text
POST /api/device-data
GET /api/latest-data
```

2. 保持 JSON 字段不变。

3. 替换 API 部署平台：

- Supabase Edge Functions -> 腾讯云云函数
- Supabase Edge Functions -> 阿里云函数
- Supabase Edge Functions -> 自建 Node.js 服务

4. 替换 repository 实现：

- `sensorRepository.ts` 当前使用 Supabase。
- 未来可以换成 MySQL、PostgreSQL、MongoDB 或 HTTP 内部服务。
- `sensorService.ts` 和 `plantStateService.ts` 尽量不改。

5. 前端和 ESP32 尽量不用改，只改 API base URL。

## 12. 安全注意事项

当前 MVP 做了最小设备校验：

```text
config.validDeviceIds = ["sensor_001"]
```

真实设备接入前需要增强：

- 不要把 Supabase `service_role` key 写进 Electron 前端。
- Edge Function 里使用环境变量读取 `SUPABASE_SERVICE_ROLE_KEY`。
- Electron 端最多使用 anon key 或请求公开安全 API。
- 真实 ESP32 应增加 `device_token`、签名、时间戳或 HMAC。
- 不要只依赖 `device_id`，因为它可以被伪造。
- 如果开放公网接口，需要考虑速率限制和异常数据防护。

## 13. Supabase 部署步骤

1. 创建 Supabase 项目。

2. 在 SQL Editor 执行：

```text
supabase/migrations/001_create_plant_readings.sql
```

3. 设置 Edge Function 环境变量：

```bash
supabase secrets set SUPABASE_URL="https://<project-ref>.supabase.co"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
```

4. 部署函数：

```bash
supabase functions deploy device-data
supabase functions deploy latest-data
```

5. 测试接口。

如果使用 Supabase Dashboard 手动部署，也要保证 `functions/shared` 目录随函数代码一起存在。

## 14. curl 测试命令

上传正常数据：

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/device-data" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon-key>" \
  -d '{
    "device_id": "sensor_001",
    "plant_id": "plant_001",
    "soil_moisture": 55,
    "temperature": 27,
    "light": 350,
    "air_humidity": 55,
    "battery": 87,
    "trigger_type": "manual_test"
  }'
```

上传缺水数据：

```bash
curl -i -X POST "https://<project-ref>.supabase.co/functions/v1/device-data" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon-key>" \
  -d '{
    "device_id": "sensor_001",
    "plant_id": "plant_001",
    "soil_moisture": 20,
    "temperature": 27,
    "trigger_type": "manual_test"
  }'
```

读取最新数据：

```bash
curl -i "https://<project-ref>.supabase.co/functions/v1/latest-data?device_id=sensor_001" \
  -H "Authorization: Bearer <anon-key>"
```

## 15. 后续开发 TODO

- 接入真实 ESP32。
- 增加 `device_token` 或签名鉴权。
- 增加 Supabase Realtime 或 WebSocket，但不要在 MVP 第一版强上。
- 增加更多状态，例如 `light_low`、`cold`。
- 增加历史曲线。
- 增加用户系统和多植物绑定。
- 增加 AI 聊天，但应和传感器状态链路解耦。
- 增加 RLS 策略和更完整的权限模型。
