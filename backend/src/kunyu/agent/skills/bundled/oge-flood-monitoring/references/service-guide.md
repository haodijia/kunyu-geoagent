# flood_monitoring_bundle 使用参考

本说明对应服务契约 2.0.0；调用时通过 `oge_get_service_definition` 核对当前登记版本。

## 输入与参数

调用时显式提供七个 `myData/完整文件名` 参数。用 OGE 资产的名称和扩展名组成路径。两期各三份影像必须互不相同，按下表核对波段顺序。服务固定使用 EPSG:32649、10 米分析网格，源数据需已核实同投影、同原点、同范围。SWIR、SCL 最近邻重采样到 10 米不会增加原始空间细节。服务按资产范围计算。日期、行政区和地图选区用于发现与核实资产或统计已完成的成果。

| 输入 | 前期参数 | 后期参数 |
| --- | --- | --- |
| 光学，依次 B02/B03/B04/B08 | `beforeCoverageID` | `coverageID` |
| 短波红外，依次 B11/B12 | `beforeSwirPath` | `swirPath` |
| 单波段场景分类 SCL | `beforeSclPath` | `sclPath` |

另传 `poiRasterPath`，指向同网格单波段关注点正整数 ID 栅格。`poiMaxId` 是纳入计算的 ID 上限。

反射率乘数默认为 0.0001，要求源数据已处理偏移。参与指数波段的源值必须为正，分母有效，指数落在[-1,1]内；有效观测还要求 SCL 为 4、5 或 6。

NDWI=(Green−NIR)/(Green+NIR)，MNDWI=(Green−SWIR1)/(Green+SWIR1)。单期两指数都严格大于各自阈值时判为水体；两者分歧单列。双期均有效且各期无指数分歧时，才进入水体变化比较。

敏感性分析分别对两个指数取基准、减步长、加步长，组成九组阈值。基准阈值±步长均须仍在[-1,1]内，远端不会自动截断。阈值未经校准，不把默认0称为普适阈值。

阈值对比时，沿用原作业的明确输入和统计范围，按需求调整 `ndwiThreshold`、`mndwiThreshold` 或 `thresholdStep`，保留原成果。

## 成果与解释

一次计算输出一个21波段 float32 GeoTIFF。每个视图引用对应的1基波段索引；不同波段的有效掩膜不一定相同，点查和统计必须选定视图或波段。

| 波段 | 视图 ID | 解读 |
| --- | --- | --- |
| 1 | `change_class` | 0稳定非水体、1持续水体、2新增、3退水、4指数分歧、5无共同有效观测 |
| 2 | `quality_class` | 0双方有效、1仅前期无效、2仅后期无效、3双方无效 |
| 3、4 | `before_water`、`after_water` | 分别表示前后期水体 |
| 5 | `common_valid_mask` | 双期共同有效观测掩膜 |
| 6 | `comparison_valid_mask` | 双期有效且各期两指数一致的比较范围 |
| 7 | `uncertain_mask` | 指数分歧范围 |
| 8、9、10 | `new_flood`、`persistent_water`、`receded_water` | 新增、持续、退水掩膜；值1表示属于该类 |
| 11、12、13 | `before_ndwi`、`after_ndwi`、`ndwi_change` | 前后期 NDWI 及后期减前期的差值 |
| 14、15、16 | `before_mndwi`、`after_mndwi`、`mndwi_change` | 前后期 MNDWI 及后期减前期的差值 |
| 17 | `flood_vote_count` | 九组中判为新增水体的次数，0–9；无共同有效观测为 NoData |
| 18 | `stable_flood` | 九组均判为新增水体的范围 |
| 19 | `sensitivity_class` | 0无新增票、1有1–8票、2有9票、3无共同有效观测 |
| 20 | `poi_id` | 源关注点 ID，需与源矢量关联；不能将像元数解释为设施数 |
| 21 | `poi_status` | 关注点像元的变化类别，编码与主分类一致 |

常见追问可直接复用成果：

- “为什么这里没结论”：先点查 `change_class`，再对照 `quality_class`、`uncertain_mask`；区分无效观测、指数分歧和稳定非水体。
- “圈出的新增水体多少”：对 `new_flood` 与消息附带的区域执行 `map_region_statistics`，读取值1的 `classes` 或 `values:[1]` 对应的 `value_areas`，同时报告有效覆盖。
- “结果是否依赖阈值”：查看 `flood_vote_count`、`stable_flood` 和 `sensitivity_class`，比较基准候选、九组一致及1–8票范围，不换算为概率。
- “前后期对照”：将 `before_water`、`after_water` 用同一个 `output_id` 添加为两个图层，再在地图中选择卷帘对比。

全幅各波段 summary 的统计来自原始文件；主分类面积按 `summary.value_counts` 的 `pixel_count × grid_pixel_area_m2` 计算，平方米除以1,000,000转为平方千米。不得将0–5的分类均值当作水深、严重程度或受灾比例。区域统计取对应类别或值的面积，并说明统计区域、有效像元和覆盖限制。
