---
name: oge-flood-monitoring
description: 调用 OGE 已发布的 flood_monitoring_bundle 洪水监测服务，完成双期水体变化、观测质量和阈值敏感性分析，并展示、点查与统计同一份21波段成果。用于郁江默认案例、兼容输入替换和已有服务成果解读。
---

# OGE 洪水监测服务

使用已登记的 `flood_monitoring_bundle`。它根据双期光学、SWIR、SCL 和关注点栅格，在 OGE 计算水体变化，返回一个21波段数值 GeoTIFF。运行前读取 `oge_get_service_definition` 返回的当前版本、参数、默认值、presentation 与 limitations；服务定义是已登记契约，不证明远端服务在线或账号有权访问数据。

用户仅询问服务用法时解释操作，不提交计算。需要参考文档时，将相对路径拼到技能返回的资源目录，再用 `read` 读取。

## 选择输入与参数

默认案例为广西贵港郁江，前期观测 **2026-06-22**，后期观测 **2026-07-12**。用户要求使用默认案例时，可使用空 `parameters`；先说明区域和两期日期。用户指定其他区域或日期时，不得把默认案例冒充对应分析。

这个服务没有 `geometry`、`bbox`、行政区、起止日期或 `outputProduct` 参数。计算覆盖输入栅格范围；地图视口不定义计算范围。消息附带的 `map_selection.geometry` 用于既有成果的点查和区域统计，不会裁剪服务输入。替换输入前使用 `oge_list_my_data`、`oge_get_my_data_detail` 核实账号下的真实资产；读取 [输入与参数](references/service-guide.md#输入与参数)，确认七份输入与固定网格兼容。缺少兼容资产时，说明需要准备的数据，不提交默认案例替代任务。

## 调用与等待

1. 读取服务定义：

   ```json
   {"service_name":"flood_monitoring_bundle"}
   ```

   以上为 `oge_get_service_definition` 的参数。

2. 使用 `oge_execute_service` 提交一次计算。默认案例的参数示例：

   ```json
   {
     "service_name":"flood_monitoring_bundle",
     "title":"郁江双期水体变化分析",
     "parameters":{}
   }
   ```

   只覆盖已确认需要调整的字段，其余使用服务默认值。OGE 登录在设置中完成，AppKey 由服务端配置；工具参数不包含口令、令牌或 AppKey。按工具返回的实际审批要求继续。

3. 返回 `job.status` 尚未完成时，用 `job_output` 查询同一个应用任务的 `job.id`，例如 `{"job_id":"实际返回的job.id","wait":true,"timeout_ms":30000}`。超时仅表示本次等待结束，不重复调用服务。丢失任务身份时先用 `job_list` 查找；应用任务 ID 与 OGE 远端 `jobId` 分开记录。提交结果不明时先查已有任务，不通过重提来查询状态，也不声称远端任务已取消。
4. 成功后读取终态结果中的 `analysis_output_id`、`output.metadata` 和 `limitations`；大结果按 `result_file_path` 用 `read` 读取。以实际返回的波段与视图为准，不把任务 ID、资产路径或 `processId` 当成图片地址。缺少登录、输入不可访问、参数错误或任务失败时，报告实际错误及修正方法。

## 展示与继续分析

先用 `map_present` 展示主分类视图，参数形式为：

```json
{"rasters":[{"output_id":"实际返回的analysis_output_id","view_id":"change_class"}]}
```

- 水体变化：`change_class`、`before_water`、`after_water`、`new_flood`、`persistent_water`、`receded_water`。
- 质量追问：`quality_class`、`common_valid_mask`、`comparison_valid_mask`、`uncertain_mask`。
- 阈值敏感性：`flood_vote_count`、`stable_flood`、`sensitivity_class`。
- 指数与关注点：按当前服务定义选择相应视图，含义见 [成果与解释](references/service-guide.md#成果与解释)。

所有视图引用同一个 `output_id`。切换波段、质量分析、卷帘、透明度、点查和区域统计都复用原始成果；只有输入或科学计算参数改变时，才另行提交计算。`map_present` 成功只表示已添加图层；需由 `map_get_context` 确认当前图层 revision 的渲染状态，才能声称显示完成。

用户选点或圈选后，使用消息中的 `map_selection`，或通过 `map_get_context` 获取图层与当前选择，将 `layer_id` 对应到 `output_id`、`view_id`。用 `map_sample_raster` 读取该点原值，用 `map_region_statistics` 传递同一 geometry 统计；无需让用户重复填写坐标。统计超过四百万像元限制时缩小或合理分区，不重跑 OGE。

## 解读与交付

主分类为：0稳定非水体、1持续水体、2新增水体候选、3退水、4指数分歧、5无共同有效观测。类别0虽然透明，仍参与对应统计；类别5与研究区外 NoData 分开。分类编码均值没有业务意义。

报告引用实际任务、输入日期、参数、成果 ID、视图与统计区域。全幅 summary 的面积为分类像元数乘 `grid_pixel_area_m2`，标注“投影网格面积”；区域统计使用像元中心纳入规则与 WGS84 椭球面积，两者分开说明。结论中的面积和数量取自本次结果，不复用历史验收数字。

新增水体候选不等于已核实洪涝，持续水体不等于永久水体。九组阈值票数不是概率或精度，九组一致仅说明本组参数范围内稳定；NoData 不计为0票。两期观测不能代表洪峰最大范围，也不提供水深、人口、设施整体受灾或损失结论。关注点需以实际 `poi_id` 关联源矢量；`poiMaxId` 是编号上限，不是点位数量。
