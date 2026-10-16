# OGE 当前算子目录

采集时间：2026-10-16 13:34:39 CST。当前登录账号可见目录共 **614 条**，ID 和名称均无重复。

数据来源：官网 `POST https://openge.org.cn/api/model/listByTags4Catalog`，请求 `{"pageNum":1,"pageSize":1000}`，返回 total=614、pages=1、records=614；与 `GET /model/getTree` 的 614 个叶子节点逐 ID 交叉核对，一致。这里只读取目录，没有逐个提交计算。

完整结构化清单：[oge-operators.csv](data/oge-operators.csv)。CSV 保留 ID、名称、别名、类型、状态、功能分类、目录与说明，可用于后续工具目录生成；它不含算子的完整入参 schema。

## 功能分类汇总

| 功能分类 | 数量 |
| --- | ---: |
| 栅格数据算法 | 179 |
| 矢量数据算法 | 178 |
| 系统基础算法 | 110 |
| 机器学习算法 | 50 |
| 地形分析算法 | 33 |
| 遥感AI模型 | 30 |
| 地学分析算法 | 24 |
| 其它 | 10 |
| **合计** | **614** |

以实际叶子节点计数。`GET /model/getCatalogTree` 的 modelCount 汇总字段与可见叶子列表不一致，不能直接相加作为当前数量。

## 类型与命名分组

- 平台 type=1：**584 条**。
- 平台 type=2：**30 条**，当前全部属于“遥感AI模型”大类。
- 当前列表 614 条的 status 均为 1。目录存在或 status=1，不等同于每条算子的输入协议、执行链路和成果类型都已验证。
- 共 17 个有包名前缀的分组，另有 23 条无包名条目。

| 名称前缀 | 数量 |
| --- | ---: |
| Coverage | 229 |
| FeatureCollection | 161 |
| Feature | 46 |
| SpatialStats | 43 |
| Filter | 36 |
| (无包名) | 23 |
| Service | 21 |
| Kernel | 21 |
| CoverageCollection | 13 |
| Geometry | 10 |
| sd | 4 |
| gn | 1 |
| 2026081502 | 1 |
| 2026081601 | 1 |
| Collection | 1 |
| ComputedObject | 1 |
| CoverageArray | 1 |
| MLmodel | 1 |

## 与旧目录的变化

仓库 2026-09-29 的旧清单为 624 条。此次新增可见 13 条、不再出现 23 条，净变化 -10。这里描述的是目录可见性差异，不推断条目已被物理删除。

**新增可见：**

- `Coverage.terrWatershedBasins`
- `Filter.coveredBy`
- `Filter.gt`
- `Filter.gte`
- `Filter.lessThan`
- `Filter.lt`
- `Filter.overlaps`
- `Service.getCoverageFromResult`
- `Service.getCoverageFromSystem`
- `Service.getCoverageFromUpload`
- `Service.getFeatureCollectionFromResult`
- `Service.getFeatureCollectionFromSystem`
- `Service.getFeatureCollectionFromUpload`

**旧清单中存在、此次未出现：**

- `Coverage.ISODATAClusteringForGridsBySAGA`
- `Coverage.OpticalAtmosphericByOTB`
- `Coverage.gridStatisticsForPolygonsBySAGA`
- `Coverage.histogramMatchingBySAGA`
- `Coverage.largeScaleMeanShiftRasterByOTB`
- `Coverage.largeScaleMeanShiftVectorByOTB`
- `Coverage.localStatisticExtractionByOTB`
- `Coverage.meanShiftSmoothingByOTB`
- `Coverage.obtainUTMZoneFromGeoPointByOTB`
- `Coverage.outGdalByGrass`
- `Coverage.resampBsplineByGrass`
- `Coverage.segmentationMeanshiftRasterByOTB`
- `Coverage.segmentationMeanshiftVectorByOTB`
- `Coverage.segmentationMprofilesdRasterByOTB`
- `Coverage.segmentationMprofilesdVectorByOTB`
- `Coverage.segmentationWatershedRasterByOTB`
- `Coverage.segmentationWatershedVectorByOTB`
- `Coverage.simpleFilterBySAGA`
- `Coverage.warpGeoreByGDAL`
- `FeatureCollection.addFieldByQGIS`
- `FeatureCollection.extractFromLocationByQGIS`
- `FeatureCollection.pointsDisplacementByQGIS`
- `FeatureCollection.translatedFeaturesByQGIS`

## 工具封装边界

- 614 条是平台目录条目，包含计算算子，以及 Filter、Kernel、对象构建、样式、输出、服务访问等辅助能力，不能机械地认为每一条都是独立的远端计算任务。
- 已完成真实验证的范围是原生 NDVI、NDVI 成果交给 addNum，以及 toFloat→NDVI→addNum 的单 DAG。其余条目没有逐项执行验收。
- 原生工具的参数应读取 `/computation-api/process/info?processName=...` 后生成，不能用名称或样例猜测参数。可以由统一执行适配器支撑各算子的工具定义，按需向模型暴露。
- `executeCode` 可封装为组合入口，但当前实测它先生成 DAG；还需 addTaskRecord 启动批处理、等待状态及收集成果，才能构成完整工具生命周期。
- 本目录不为每一行生成未验证的 OpenAPI 可执行地址。AppKey 发布状态和 JWT 入口的可执行性不同；NDVI 的 AppKey 入口本次返回“该服务未发布”，JWT 原生执行及平台 DAG 则已实测成功。

调用协议与真实执行证据见[OGE 原生算子调用核验](develop/OGE原生算子调用核验.md)。

## 完整目录

### 栅格数据算法（179）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 1539 | `Coverage.GLCM` | 灰度共生矩阵纹理分析 | 纹理分析 | 1 |
| 1542 | `Coverage.IHSFusion` | IHS变换融合 | 处理与转换 | 1 |
| 1699 | `Coverage.LST` | 地表温度计算 | 遥感指数计算 | 1 |
| 1675 | `Coverage.NDBI` | 归一化建筑指数 | 遥感指数计算 | 1 |
| 1700 | `Coverage.NDSSI` | 归一化悬浮泥沙指数 | 遥感指数计算 | 1 |
| 1481 | `Coverage.NDVI` | 归一化植被指数 | 遥感指数计算 | 1 |
| 1676 | `Coverage.NDWI` | 归一化水体指数 | 遥感指数计算 | 1 |
| 1541 | `Coverage.PCA` | 主成分分析 | 栅格分析 | 1 |
| 1442 | `Coverage.SFSTextureExtractionByOTB` | 使用OTB SFS纹理提取 | 纹理分析 | 1 |
| 114 | `Coverage.abs` | 绝对值运算 | 数学与逻辑运算 | 1 |
| 145 | `Coverage.acos` | 反余弦运算 | 数学与逻辑运算 | 1 |
| 108 | `Coverage.add` | 加法运算 | 数学与逻辑运算 | 1 |
| 154 | `Coverage.addBands` | 添加波段 | 处理与转换 | 1 |
| 321 | `Coverage.addNum` | 加常数运算 | 数学与逻辑运算 | 1 |
| 137 | `Coverage.and` | 逻辑与运算 | 数学与逻辑运算 | 1 |
| 1430 | `Coverage.area` | 栅格有效面积计算 | 栅格统计 | 1 |
| 144 | `Coverage.asin` | 反正弦运算 | 数学与逻辑运算 | 1 |
| 443 | `Coverage.assignProjectionByGDAL` | 使用GDAL指定投影 | 重采样与投影变换 | 1 |
| 146 | `Coverage.atan` | 反正切运算 | 数学与逻辑运算 | 1 |
| 147 | `Coverage.atan2` | 双参数反正切运算 | 数学与逻辑运算 | 1 |
| 499 | `Coverage.atmosphericCorrectionByOTB` | 使用OTB大气校正 | 栅格预处理 | 1 |
| 153 | `Coverage.bandNames` | 获取所有波段名称 | 处理与转换 | 1 |
| 1434 | `Coverage.bandNum` | 获取波段数量 | 处理与转换 | 1 |
| 112 | `Coverage.bandTypes` | 获取所有波段像元类型 | 处理与转换 | 1 |
| 1536 | `Coverage.bilateralFilter` | 双边滤波 | 栅格滤波 | 1 |
| 111 | `Coverage.binarization` | 二值化处理 | 处理与转换 | 1 |
| 322 | `Coverage.bitwiseAnd` | 按位与运算 | 数学与逻辑运算 | 1 |
| 323 | `Coverage.bitwiseNot` | 按位非运算 | 数学与逻辑运算 | 1 |
| 324 | `Coverage.bitwiseOr` | 按位或运算 | 数学与逻辑运算 | 1 |
| 325 | `Coverage.bitwiseXor` | 按位异或运算 | 数学与逻辑运算 | 1 |
| 221 | `Coverage.blendByGrass` | 基于GRASS混合叠加 | 处理与转换 | 1 |
| 1535 | `Coverage.broveyFusion` | Brovey变换融合 | 处理与转换 | 1 |
| 222 | `Coverage.bufferByGrass` | 基于GRASS栅格缓冲 | 处理与转换 | 1 |
| 1436 | `Coverage.calLSWI` | 陆地表面水分指数计算 | 遥感指数计算 | 1 |
| 1435 | `Coverage.calNDVI` | 归一化植被指数计算 | 遥感指数计算 | 1 |
| 1438 | `Coverage.calNPP` | 植被生产力计算 | 遥感指数计算 | 1 |
| 1530 | `Coverage.cannyEdgeDetection` | Canny边缘检测 | 栅格分析 | 1 |
| 326 | `Coverage.cat` | 拼接覆盖数据 | 处理与转换 | 1 |
| 1544 | `Coverage.catTwoCoverage` | 拼接两个覆盖数据 | 处理与转换 | 1 |
| 327 | `Coverage.cbrt` | 立方根运算 | 数学与逻辑运算 | 1 |
| 148 | `Coverage.ceil` | 向上取整 | 数学与逻辑运算 | 1 |
| 328 | `Coverage.clamp` | 数值钳制 | 处理与转换 | 1 |
| 329 | `Coverage.clip` | 裁剪 | 处理与转换 | 1 |
| 297 | `Coverage.clipRasterByExtentByGDAL` | 基于GDAL按范围裁剪栅格 | 处理与转换 | 1 |
| 298 | `Coverage.clipRasterByMaskLayerByGDAL` | 基于GDAL按掩膜层裁剪栅格 | 处理与转换 | 1 |
| 223 | `Coverage.coinByGrass` | 使用GRASS重合度分析 | 栅格分析 | 1 |
| 224 | `Coverage.compositeByGrass` | 基于GRASS复合运算 | 处理与转换 | 1 |
| 122 | `Coverage.convolve` | 执行指定卷积运算 | 栅格滤波 | 1 |
| 141 | `Coverage.cos` | 余弦运算 | 数学与逻辑运算 | 1 |
| 143 | `Coverage.cosh` | 双曲余弦运算 | 数学与逻辑运算 | 1 |
| 225 | `Coverage.crossByGrass` | 使用GRASS交叉表分析 | 栅格分析 | 1 |
| 330 | `Coverage.date` | 获取单景成像日期 | 处理与转换 | 1 |
| 1537 | `Coverage.dilate` | 膨胀运算 | 处理与转换 | 1 |
| 479 | `Coverage.dimensionalityReductionByOTB` | 使用OTB降维处理 | 栅格预处理 | 1 |
| 110 | `Coverage.divide` | 除法运算 | 数学与逻辑运算 | 1 |
| 331 | `Coverage.divideNum` | 除常数运算 | 数学与逻辑运算 | 1 |
| 478 | `Coverage.edgeExtractionByOTB` | 使用OTB边缘提取 | 栅格分析 | 1 |
| 333 | `Coverage.entropy` | 熵值计算 | 处理与转换 | 1 |
| 150 | `Coverage.eq` | 相等比较 | 数学与逻辑运算 | 1 |
| 1538 | `Coverage.erosion` | 腐蚀运算 | 处理与转换 | 1 |
| 301 | `Coverage.fillNodataByGDAL` | 基于GDAL填充无效值 | 处理与转换 | 1 |
| 1478 | `Coverage.fillnullByGrass` | 基于GRASS空值填充 | 处理与转换 | 1 |
| 1564 | `Coverage.filter` | 通用滤波 | 栅格滤波 | 1 |
| 149 | `Coverage.floor` | 向下取整 | 数学与逻辑运算 | 1 |
| 125 | `Coverage.focalMax` | 焦点最大值滤波 | 栅格滤波 | 1 |
| 123 | `Coverage.focalMean` | 焦点均值滤波 | 栅格滤波 | 1 |
| 124 | `Coverage.focalMedian` | 焦点中值滤波 | 栅格滤波 | 1 |
| 126 | `Coverage.focalMin` | 焦点最小值滤波 | 栅格滤波 | 1 |
| 334 | `Coverage.focalMode` | 焦点众数滤波 | 栅格滤波 | 1 |
| 1533 | `Coverage.gaussianBlur` | 高斯模糊 | 栅格滤波 | 1 |
| 1559 | `Coverage.geometricCorrection` | 几何校正 | 栅格预处理 | 1 |
| 302 | `Coverage.gridAverageByGDAL` | 基于GDAL网格平均插值 | 处理与转换 | 1 |
| 303 | `Coverage.gridDataMetricsByGDAL` | 基于GDAL网格数据度量 | 处理与转换 | 1 |
| 238 | `Coverage.gridInverseDistanceByGDAL` | 基于GDAL反距离加权插值 | 处理与转换 | 1 |
| 239 | `Coverage.gridInverseDistanceNNRByGDAL` | 基于GDAL反距离加权最近邻插值 | 处理与转换 | 1 |
| 240 | `Coverage.gridLinearByGDAL` | 基于GDAL线性插值 | 处理与转换 | 1 |
| 241 | `Coverage.gridNearestNeighborByGDAL` | 基于GDAL最近邻插值 | 处理与转换 | 1 |
| 1701 | `Coverage.growByGrass` | 基于GRASS区域生长 | 处理与转换 | 1 |
| 151 | `Coverage.gt` | 大于比较 | 数学与逻辑运算 | 1 |
| 152 | `Coverage.gte` | 大于等于比较 | 数学与逻辑运算 | 1 |
| 337 | `Coverage.histogram` | 直方图计算 | 栅格统计 | 1 |
| 1562 | `Coverage.histogramBin` | 直方图分箱 | 栅格统计 | 1 |
| 1532 | `Coverage.histogramEqualization` | 直方图均衡化 | 栅格统计 | 1 |
| 338 | `Coverage.hsvToRgb` | HSV转RGB色彩空间 | 处理与转换 | 1 |
| 226 | `Coverage.latlongByGrass` | 基于GRASS经纬度生成 | 处理与转换 | 1 |
| 1527 | `Coverage.linearTransformation` | 线性变换 | 数学与逻辑运算 | 1 |
| 339 | `Coverage.log` | 自然对数运算 | 数学与逻辑运算 | 1 |
| 340 | `Coverage.log10` | 以10为底对数运算 | 数学与逻辑运算 | 1 |
| 341 | `Coverage.lt` | 小于比较 | 数学与逻辑运算 | 1 |
| 342 | `Coverage.lte` | 小于等于比较 | 数学与逻辑运算 | 1 |
| 121 | `Coverage.mask` | 掩膜处理 | 处理与转换 | 1 |
| 343 | `Coverage.maxi` | 最大值计算 | 栅格统计 | 1 |
| 344 | `Coverage.metadata` | 获取单景栅格元数据 | 处理与转换 | 1 |
| 345 | `Coverage.mini` | 最小值计算 | 栅格统计 | 1 |
| 346 | `Coverage.mod` | 取模运算 | 数学与逻辑运算 | 1 |
| 347 | `Coverage.modNum` | 对常数取模 | 数学与逻辑运算 | 1 |
| 1433 | `Coverage.multiply` | 乘法运算 | 数学与逻辑运算 | 1 |
| 348 | `Coverage.multiplyNum` | 乘常数运算 | 数学与逻辑运算 | 1 |
| 1443 | `Coverage.multivariateAlterationDetectorByOTB` | 使用OTB多元变化检测 | 变化检测 | 1 |
| 305 | `Coverage.nearBlackByGDAL` | 基于GDAL近黑色检测 | 处理与转换 | 1 |
| 227 | `Coverage.neighborsByGrass` | 使用GRASS邻域分析 | 栅格分析 | 1 |
| 115 | `Coverage.neq` | 不等比较 | 数学与逻辑运算 | 1 |
| 219 | `Coverage.normalizedDifference` | 通用归一化差值计算 | 遥感指数计算 | 1 |
| 139 | `Coverage.not` | 逻辑非运算 | 数学与逻辑运算 | 1 |
| 138 | `Coverage.or` | 逻辑或运算 | 数学与逻辑运算 | 1 |
| 1543 | `Coverage.panSharp` | 全色锐化 | 栅格预处理 | 1 |
| 229 | `Coverage.patchByGrass` | 基于GRASS图斑分析 | 处理与转换 | 1 |
| 242 | `Coverage.polygonizeByGDAL` | 使用GDAL栅格矢量化 | 处理与转换 | 1 |
| 120 | `Coverage.polynomial` | 多项式变换 | 数学与逻辑运算 | 1 |
| 117 | `Coverage.pow` | 幂运算 | 数学与逻辑运算 | 1 |
| 349 | `Coverage.powNum` | 常数次幂运算 | 数学与逻辑运算 | 1 |
| 350 | `Coverage.projection` | 获取单景栅格数据投影信息 | 重采样与投影变换 | 1 |
| 306 | `Coverage.proximityByGDAL` | 基于GDAL邻近度分析 | 处理与转换 | 1 |
| 1444 | `Coverage.radiometricIndicesByOTB` | 使用OTB辐射指数计算 | 栅格预处理 | 1 |
| 1621 | `Coverage.randomSample` | 随机采样 | 重采样与投影变换 | 1 |
| 1422 | `Coverage.rasterOverwrite` | 栅格联合 | 处理与转换 | 1 |
| 283 | `Coverage.rasterizeOverByGDAL` | 使用GDAL叠加栅格化 | 处理与转换 | 1 |
| 1702 | `Coverage.rasterizeOverFixedValueByGDAL` | 使用GDAL固定值叠加栅格化 | 处理与转换 | 1 |
| 559 | `Coverage.reclass` | 栅格重分类 | 栅格分析 | 1 |
| 1563 | `Coverage.reduceRegion` | 按区域栅格统计运算 | 栅格统计 | 1 |
| 1534 | `Coverage.reduction` | 栅格统计运算 | 栅格统计 | 1 |
| 353 | `Coverage.remap` | 值重映射 | 处理与转换 | 1 |
| 113 | `Coverage.rename` | 波段重命名 | 处理与转换 | 1 |
| 444 | `Coverage.reportByGrass` | 使用GRASS报告生成 | 栅格分析 | 1 |
| 354 | `Coverage.reproject` | 单景栅格数据重投影 | 重采样与投影变换 | 1 |
| 430 | `Coverage.resampFilterByGrass` | 使用GRASS滤波重采样 | 重采样与投影变换 | 1 |
| 431 | `Coverage.resampInterpByGrass` | 使用GRASS插值重采样 | 重采样与投影变换 | 1 |
| 432 | `Coverage.resampStatsByGrass` | 使用GRASS统计重采样 | 重采样与投影变换 | 1 |
| 355 | `Coverage.resample` | 重采样 | 重采样与投影变换 | 1 |
| 450 | `Coverage.resampleByGrass` | 使用GRASS重采样 | 重采样与投影变换 | 1 |
| 230 | `Coverage.rescaleByGrass` | 基于GRASS栅格缩放 | 处理与转换 | 1 |
| 243 | `Coverage.rescaleRasterByQGIS` | 基于QGIS栅格缩放 | 处理与转换 | 1 |
| 356 | `Coverage.rgbToHsv` | RGB转HSV色彩空间 | 处理与转换 | 1 |
| 244 | `Coverage.rgbToPctByGDAL` | 基于GDAL RGB转调色板 | 处理与转换 | 1 |
| 357 | `Coverage.round` | 四舍五入 | 数学与逻辑运算 | 1 |
| 1624 | `Coverage.sampleRegions` | 区域采样 | 重采样与投影变换 | 1 |
| 220 | `Coverage.selectBands` | 选择波段 | 处理与转换 | 1 |
| 1486 | `Coverage.setValidDataRange` | 设置有效数据范围 | 处理与转换 | 1 |
| 1487 | `Coverage.setValueRangeByPercentage` | 按百分比设置值范围 | 处理与转换 | 1 |
| 504 | `Coverage.sieveByGDAL` | 基于GDAL碎斑过滤 | 处理与转换 | 1 |
| 116 | `Coverage.signum` | 符号函数运算 | 数学与逻辑运算 | 1 |
| 140 | `Coverage.sin` | 正弦运算 | 数学与逻辑运算 | 1 |
| 142 | `Coverage.sinh` | 双曲正弦运算 | 数学与逻辑运算 | 1 |
| 358 | `Coverage.slice` | 切片提取 | 处理与转换 | 1 |
| 359 | `Coverage.sqrt` | 平方根运算 | 数学与逻辑运算 | 1 |
| 1529 | `Coverage.standardDeviationCalculation` | 标准差计算 | 栅格统计 | 1 |
| 1531 | `Coverage.standardDeviationStretching` | 标准差拉伸 | 处理与转换 | 1 |
| 231 | `Coverage.statsByGrass` | 使用GRASS统计分析 | 栅格分析 | 1 |
| 109 | `Coverage.subtract` | 减法运算 | 数学与逻辑运算 | 1 |
| 360 | `Coverage.subtractNum` | 减常数运算 | 数学与逻辑运算 | 1 |
| 1476 | `Coverage.supportStatsByGrass` | 使用GRASS支持域统计 | 栅格分析 | 1 |
| 233 | `Coverage.surfAreaByGrass` | 使用GRASS表面积计算 | 栅格统计 | 1 |
| 361 | `Coverage.tan` | 正切运算 | 数学与逻辑运算 | 1 |
| 362 | `Coverage.tanh` | 双曲正切运算 | 数学与逻辑运算 | 1 |
| 435 | `Coverage.textureByGrass` | 使用GRASS纹理分析 | 纹理分析 | 1 |
| 363 | `Coverage.toDouble` | 将单景栅格像元类型转换为双精度浮点型 | 处理与转换 | 1 |
| 364 | `Coverage.toFloat` | 将单景栅格像元类型转换为单精度浮点型 | 处理与转换 | 1 |
| 365 | `Coverage.toInt16` | 将单景栅格像元类型转换为16位整型 | 处理与转换 | 1 |
| 366 | `Coverage.toInt32` | 将单景栅格像元类型转换为32位整型 | 处理与转换 | 1 |
| 367 | `Coverage.toInt8` | 将单景栅格像元类型转换为8位整型 | 处理与转换 | 1 |
| 368 | `Coverage.toUint16` | 将单景栅格像元类型转换为16位无符号整型 | 处理与转换 | 1 |
| 369 | `Coverage.toUint8` | 将单景栅格像元类型转换为8位无符号整型 | 处理与转换 | 1 |
| 247 | `Coverage.translateByGDAL` | 使用GDAL栅格平移 | 重采样与投影变换 | 1 |
| 235 | `Coverage.volumeByGrass` | 使用GRASS体积计算 | 栅格统计 | 1 |
| 248 | `Coverage.warpByGDAL` | 使用GDAL几何变换 | 栅格预处理 | 1 |
| 370 | `CoverageCollection.and` | 单景栅格数据集合逻辑与 | 数学与逻辑运算 | 1 |
| 378 | `CoverageCollection.max` | 单景栅格集合最大值 | 栅格统计 | 1 |
| 379 | `CoverageCollection.mean` | 单景栅格集合均值 | 栅格统计 | 1 |
| 380 | `CoverageCollection.median` | 单景栅格集合中位数 | 栅格统计 | 1 |
| 447 | `CoverageCollection.mergeCoverages` | 合并单景栅格集合 | 处理与转换 | 1 |
| 381 | `CoverageCollection.min` | 单景栅格集合最小值 | 栅格统计 | 1 |
| 382 | `CoverageCollection.mode` | 单景栅格数据集合众数计算 | 数学与逻辑运算 | 1 |
| 207 | `CoverageCollection.mosaic` | 镶嵌拼接 | 处理与转换 | 1 |
| 383 | `CoverageCollection.or` | 单景栅格数据集合逻辑或 | 数学与逻辑运算 | 1 |
| 388 | `CoverageCollection.sum` | 单景栅格集合求和 | 栅格统计 | 1 |
| 542 | `SpatialStats.STSampling.SandwichSampling` | 三明治采样 | 重采样与投影变换 | 1 |
| 539 | `SpatialStats.STSampling.randomSampling` | 时空随机采样 | 重采样与投影变换 | 1 |
| 540 | `SpatialStats.STSampling.regularSampling` | 时空规则采样 | 重采样与投影变换 | 1 |
| 541 | `SpatialStats.STSampling.stratifiedSampling` | 分层采样 | 重采样与投影变换 | 1 |

### 矢量数据算法（178）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 669 | `Feature.area` | 计算矢量要素几何面积 | 几何计算 | 1 |
| 666 | `Feature.bounds` | 边界框计算 | 几何处理 | 1 |
| 668 | `Feature.buffer` | 缓冲区分析 | 几何处理 | 1 |
| 671 | `Feature.centroid` | 质心计算 | 几何处理 | 1 |
| 667 | `Feature.closestPoint` | 计算最近点 | 几何计算 | 1 |
| 663 | `Feature.closestPoints` | 计算最近点数组 | 几何计算 | 1 |
| 672 | `Feature.containedIn` | 几何被包含判断 | 几何计算 | 1 |
| 674 | `Feature.contains` | 几何包含判断 | 几何计算 | 1 |
| 673 | `Feature.convexHull` | 生成凸包 | 几何处理 | 1 |
| 675 | `Feature.copyProperties` | 复制要素属性 | 管理和访问 | 1 |
| 676 | `Feature.cutLines` | 线段分割 | 几何处理 | 1 |
| 701 | `Feature.densify` | 节点加密 | 几何处理 | 1 |
| 677 | `Feature.difference` | 差集运算 | 几何处理 | 1 |
| 678 | `Feature.disjoint` | 几何相离判断 | 几何计算 | 1 |
| 679 | `Feature.dissolve` | 融合几何 | 几何处理 | 1 |
| 680 | `Feature.distance` | 欧氏距离计算 | 几何计算 | 1 |
| 681 | `Feature.geometry` | 获取几何体 | 管理和访问 | 1 |
| 683 | `Feature.get` | 获取属性值 | 管理和访问 | 1 |
| 682 | `Feature.getNumber` | 获取数值类型的属性值 | 管理和访问 | 1 |
| 684 | `Feature.getString` | 获取字符串类型的属性值 | 管理和访问 | 1 |
| 1703 | `Feature.greatCircleDistance` | 大圆距离计算 | 几何计算 | 1 |
| 685 | `Feature.id` | 获取矢量要素ID | 管理和访问 | 1 |
| 686 | `Feature.intersection` | 交集运算 | 几何处理 | 1 |
| 687 | `Feature.intersects` | 几何相交判断 | 几何计算 | 1 |
| 688 | `Feature.length` | 计算矢量要素几何长度 | 几何计算 | 1 |
| 1704 | `Feature.manhattanDistance` | 曼哈顿距离计算 | 几何计算 | 1 |
| 689 | `Feature.perimeter` | 计算矢量要素几何周长 | 几何计算 | 1 |
| 690 | `Feature.propertyNames` | 获取要素所有属性名 | 管理和访问 | 1 |
| 698 | `Feature.reproject` | 矢量要素重投影 | 投影变换 | 1 |
| 691 | `Feature.select` | 选择属性映射为新属性名 | 管理和访问 | 1 |
| 692 | `Feature.set` | 设置属性值 | 管理和访问 | 1 |
| 693 | `Feature.setGeometry` | 设置几何体 | 管理和访问 | 1 |
| 694 | `Feature.simplify` | 几何简化 | 几何处理 | 1 |
| 695 | `Feature.symmetricDifference` | 对称差运算 | 几何处理 | 1 |
| 696 | `Feature.toArray` | 将要素属性值转换为数组 | 管理和访问 | 1 |
| 697 | `Feature.toDictionary` | 将要素转换为Map | 管理和访问 | 1 |
| 699 | `Feature.union` | 几何联合 | 几何处理 | 1 |
| 700 | `Feature.withinDistance` | 判断几何是否在限定距离范围内 | 几何计算 | 1 |
| 1706 | `FeatureCollection.addXYFieldByQGIS` | 使用QGIS添加XY坐标字段 | 管理和访问 | 1 |
| 1707 | `FeatureCollection.affineTransformByQGIS` | 使用QGIS仿射变换 | 投影变换 | 1 |
| 1827 | `FeatureCollection.aggregateArray` | 聚合为数组 | 属性统计 | 1 |
| 715 | `FeatureCollection.aggregateBounds` | 聚合边界框 | 空间统计 | 1 |
| 702 | `FeatureCollection.aggregateCount` | 聚合计数 | 属性统计 | 1 |
| 703 | `FeatureCollection.aggregateCountDistinct` | 聚合去重计数 | 属性统计 | 1 |
| 704 | `FeatureCollection.aggregateFirst` | 聚合首值 | 属性统计 | 1 |
| 739 | `FeatureCollection.aggregateIntersection` | 聚合交集 | 空间统计 | 1 |
| 705 | `FeatureCollection.aggregateMax` | 聚合最大值 | 属性统计 | 1 |
| 706 | `FeatureCollection.aggregateMean` | 聚合均值 | 属性统计 | 1 |
| 707 | `FeatureCollection.aggregateMin` | 聚合最小值 | 属性统计 | 1 |
| 708 | `FeatureCollection.aggregateProduct` | 聚合乘积 | 属性统计 | 1 |
| 710 | `FeatureCollection.aggregateSampleSD` | 聚合样本标准差 | 属性统计 | 1 |
| 709 | `FeatureCollection.aggregateSampleVAR` | 聚合样本方差 | 属性统计 | 1 |
| 711 | `FeatureCollection.aggregateStats` | 聚合统计 | 属性统计 | 1 |
| 713 | `FeatureCollection.aggregateTotalSD` | 聚合总体标准差 | 属性统计 | 1 |
| 712 | `FeatureCollection.aggregateTotalSum` | 聚合总和 | 属性统计 | 1 |
| 714 | `FeatureCollection.aggregateTotalVAR` | 聚合总体方差 | 属性统计 | 1 |
| 738 | `FeatureCollection.aggregateUnion` | 聚合联合 | 空间统计 | 1 |
| 252 | `FeatureCollection.angleToNearestByQGIS` | 使用QGIS最近邻角度计算 | 几何处理 | 1 |
| 1708 | `FeatureCollection.antimeridianSplitByQGIS` | 使用QGIS反子午线分割 | 几何处理 | 1 |
| 747 | `FeatureCollection.area` | 计算面积 | 几何计算 | 1 |
| 1709 | `FeatureCollection.areaEllipsoid` | 椭球体面积计算(基于国土三调图斑面积公式) | 几何计算 | 1 |
| 1710 | `FeatureCollection.areaSpheroid` | 测地面积计算 | 几何计算 | 1 |
| 1711 | `FeatureCollection.arrayOffsetLinesByQGIS` | 使用QGIS阵列偏移线 | 几何处理 | 1 |
| 721 | `FeatureCollection.assembleNumericArray` | 将多个数值字段组装成数组字段 | 管理和访问 | 1 |
| 1712 | `FeatureCollection.assignProjectionByQGIS` | 使用QGIS指定投影 | 投影变换 | 1 |
| 749 | `FeatureCollection.boundary` | 边界提取 | 几何处理 | 1 |
| 1713 | `FeatureCollection.boundaryByQGIS` | 使用QGIS边界提取 | 几何处理 | 1 |
| 751 | `FeatureCollection.buffer` | 缓冲区分析 | 几何处理 | 1 |
| 1714 | `FeatureCollection.bufferVectorsByGDAL` | 使用GDAL矢量缓冲 | 几何处理 | 1 |
| 1715 | `FeatureCollection.clipVectorByExtentByGDAL` | 使用GDAL按范围裁剪矢量 | 几何处理 | 1 |
| 1716 | `FeatureCollection.clipVectorByPolygonByGDAL` | 使用GDAL按面裁剪矢量 | 几何处理 | 1 |
| 756 | `FeatureCollection.combine` | 合并两个字段的值 | 管理和访问 | 1 |
| 1717 | `FeatureCollection.concaveHullByQGIS` | 使用QGIS凹包生成 | 几何处理 | 1 |
| 757 | `FeatureCollection.constantColumn` | 添加常量列 | 管理和访问 | 1 |
| 261 | `FeatureCollection.convertGeometryTypeByQGIS` | 使用QGIS几何类型转换 | 几何处理 | 1 |
| 753 | `FeatureCollection.delaunay` | 德劳内三角剖分 | 几何处理 | 1 |
| 262 | `FeatureCollection.delaunayTriangulationByQGIS` | 使用QGIS德劳内三角剖分 | 几何处理 | 1 |
| 733 | `FeatureCollection.describe` | 描述性统计 | 属性统计 | 1 |
| 744 | `FeatureCollection.difference` | 差集运算 | 空间分析 | 1 |
| 741 | `FeatureCollection.differenceWithGeometry` | 与几何体求差 | 空间分析 | 1 |
| 1718 | `FeatureCollection.dissolveByGDAL` | 使用GDAL融合运算 | 空间分析 | 1 |
| 1834 | `FeatureCollection.distanceJoinQuery` | 按限定距离一对一连接查询 | 查询和连接 | 1 |
| 1835 | `FeatureCollection.distanceJoinQueryFlat` | 按限定距离一对多连接查询 | 查询和连接 | 1 |
| 717 | `FeatureCollection.distinct` | 矢量要素类数据去重 | 查询和连接 | 1 |
| 745 | `FeatureCollection.erase` | 擦除运算 | 空间分析 | 1 |
| 730 | `FeatureCollection.extractRowsAsList` | 按指定字段排序后提取指定范围的记录 | 管理和访问 | 1 |
| 395 | `FeatureCollection.filter` | 条件过滤 | 查询和连接 | 1 |
| 716 | `FeatureCollection.filterBounds` | 按几何范围过滤 | 查询和连接 | 1 |
| 718 | `FeatureCollection.filterDate` | 按日期过滤 | 查询和连接 | 1 |
| 759 | `FeatureCollection.filterMetadata` | 按元数据过滤 | 查询和连接 | 1 |
| 752 | `FeatureCollection.geoHash` | 生成GeoHash编码 | 管理和访问 | 1 |
| 719 | `FeatureCollection.geometryGetAndMerge` | 获取并合并几何体 | 空间统计 | 1 |
| 1829 | `FeatureCollection.groupCount` | 分组计数 | 属性统计 | 1 |
| 1831 | `FeatureCollection.groupCountDistinct` | 分组去重计数 | 属性统计 | 1 |
| 1830 | `FeatureCollection.groupMax` | 分组最大值 | 属性统计 | 1 |
| 1828 | `FeatureCollection.groupMean` | 分组均值 | 属性统计 | 1 |
| 1832 | `FeatureCollection.groupMin` | 分组最小值 | 属性统计 | 1 |
| 1833 | `FeatureCollection.groupSum` | 分组求和 | 属性统计 | 1 |
| 742 | `FeatureCollection.intersection` | 交集运算 | 空间分析 | 1 |
| 1818 | `FeatureCollection.intersectionByFilter` | 使用过滤条件参数的交集运算 | 空间分析 | 1 |
| 1765 | `FeatureCollection.intersectionByQGIS` | 使用QGIS交集运算 | 空间分析 | 1 |
| 1817 | `FeatureCollection.intersectionOpt` | 优化交集运算 | 空间分析 | 1 |
| 1838 | `FeatureCollection.joinOneToManyByFilter` | 基于过滤的一对多连接 | 查询和连接 | 1 |
| 1839 | `FeatureCollection.joinOneToOneByFilter` | 基于过滤的一对一连接 | 查询和连接 | 1 |
| 1816 | `FeatureCollection.kNNQuery` | K近邻查询 | 空间分析 | 1 |
| 748 | `FeatureCollection.length` | 计算长度 | 几何计算 | 1 |
| 1719 | `FeatureCollection.lengthSpheroid` | 测地长度计算 | 几何计算 | 1 |
| 720 | `FeatureCollection.limit` | 返回限定数量的矢量数据 | 查询和连接 | 1 |
| 1720 | `FeatureCollection.linesToPolygonsByQGIS` | 使用QGIS线转面 | 几何处理 | 1 |
| 723 | `FeatureCollection.merge` | 合并输入的矢量要素类 | 管理和访问 | 1 |
| 760 | `FeatureCollection.mergeAll` | 合并输入的矢量要素类(大于两个) | 管理和访问 | 1 |
| 1722 | `FeatureCollection.miniEnclosingCircleByQGIS` | 使用QGIS最小外接圆 | 几何处理 | 1 |
| 1723 | `FeatureCollection.multiRingConstantBufferByQGIS` | 使用QGIS多环等距缓冲 | 几何处理 | 1 |
| 1724 | `FeatureCollection.offsetCurveByGDAL` | 使用GDAL曲线偏移 | 几何处理 | 1 |
| 1725 | `FeatureCollection.offsetLineByQGIS` | 使用QGIS线偏移 | 几何处理 | 1 |
| 1726 | `FeatureCollection.oneSideBufferByGDAL` | 使用GDAL单侧缓冲 | 几何处理 | 1 |
| 1727 | `FeatureCollection.orientedMinimumBoundingBoxByQGIS` | 使用QGIS定向最小外接矩形 | 几何处理 | 1 |
| 750 | `FeatureCollection.perimeter` | 计算周长 | 几何计算 | 1 |
| 1728 | `FeatureCollection.perimeterSpheroid` | 测地周长计算 | 几何计算 | 1 |
| 1729 | `FeatureCollection.pointOnSurfaceByQGIS` | 使用QGIS面上取点 | 几何处理 | 1 |
| 1730 | `FeatureCollection.pointsAlongLinesByGDAL` | 使用GDAL沿线取点 | 几何处理 | 1 |
| 1731 | `FeatureCollection.pointsAlongLinesByQGIS` | 使用QGIS沿线取点 | 几何处理 | 1 |
| 275 | `FeatureCollection.poleOfInaccessibilityByQGIS` | 使用QGIS难达极点计算 | 几何处理 | 1 |
| 1732 | `FeatureCollection.polygonizeByQGIS` | 使用QGIS线转面 | 几何处理 | 1 |
| 1733 | `FeatureCollection.polygonsToLinesByQGIS` | 使用QGIS面转线 | 几何处理 | 1 |
| 1734 | `FeatureCollection.projectPointsByQGIS` | 使用QGIS点投影 | 投影变换 | 1 |
| 722 | `FeatureCollection.propertyNames` | 获取矢量要素类的所有属性名 | 管理和访问 | 1 |
| 727 | `FeatureCollection.propertySet` | 设置属性值 | 管理和访问 | 1 |
| 725 | `FeatureCollection.randomColumn` | 添加随机值列 | 管理和访问 | 1 |
| 1735 | `FeatureCollection.randomPointsAlongLineByQGIS` | 使用QGIS沿线随机取点 | 几何处理 | 1 |
| 1736 | `FeatureCollection.randomPointsInLayerBoundsByQGIS` | 使用QGIS图层范围内随机取点 | 几何处理 | 1 |
| 1737 | `FeatureCollection.randomPointsInPolygonsByQGIS` | 使用QGIS面内随机取点 | 几何处理 | 1 |
| 1738 | `FeatureCollection.randomPointsOnLinesByQGIS` | 使用QGIS线上随机取点 | 几何处理 | 1 |
| 1761 | `FeatureCollection.rasterSamplingByQGIS` | 使用QGIS基于输入矢量要素类对栅格重采样 | 管理和访问 | 1 |
| 735 | `FeatureCollection.rasterize` | 矢量栅格化 | 几何处理 | 1 |
| 1739 | `FeatureCollection.rasterizeByGDAL` | 使用GDAL矢量栅格化 | 几何处理 | 1 |
| 1740 | `FeatureCollection.rectanglesOvalsDiamondsByQGIS` | 使用QGIS规则图形生成 | 几何处理 | 1 |
| 724 | `FeatureCollection.remap` | 属性重映射 | 管理和访问 | 1 |
| 758 | `FeatureCollection.reproject` | 矢量要素类重投影 | 投影变换 | 1 |
| 1741 | `FeatureCollection.rotateFeaturesByQGIS` | 使用QGIS要素旋转 | 几何处理 | 1 |
| 731 | `FeatureCollection.sample` | 数据采样 | 管理和访问 | 1 |
| 726 | `FeatureCollection.select` | 选择属性映射为新属性名 | 管理和访问 | 1 |
| 1759 | `FeatureCollection.shortestPathPointToPointByQGIS` | 使用QGIS点对点最短路径 | 几何处理 | 1 |
| 1742 | `FeatureCollection.simplifyByQGIS` | 使用QGIS几何简化 | 几何处理 | 1 |
| 1743 | `FeatureCollection.singleSidedBufferByQGIS` | 使用QGIS单侧缓冲 | 几何处理 | 1 |
| 728 | `FeatureCollection.size` | 集合大小 | 属性统计 | 1 |
| 1744 | `FeatureCollection.smoothByQGIS` | 使用QGIS几何平滑 | 几何处理 | 1 |
| 729 | `FeatureCollection.sortAndSplit` | 矢量要素类排序重分区 | 管理和访问 | 1 |
| 746 | `FeatureCollection.spatialJoinOneToOne` | 一对一空间连接 | 查询和连接 | 1 |
| 740 | `FeatureCollection.spatialPredicateQuery` | 空间查询 | 查询和连接 | 1 |
| 755 | `FeatureCollection.subtract` | 对矢量要素类中的两列进行减法运算 | 管理和访问 | 1 |
| 1745 | `FeatureCollection.swapXYByQGIS` | 使用QGIS交换XY坐标 | 几何处理 | 1 |
| 1746 | `FeatureCollection.taperedBufferByQGIS` | 使用QGIS渐变缓冲 | 几何处理 | 1 |
| 1747 | `FeatureCollection.transectQGIS` | 使用QGIS样线生成 | 几何处理 | 1 |
| 1748 | `FeatureCollection.translateGeometryByQGIS` | 使用QGIS几何平移 | 几何处理 | 1 |
| 743 | `FeatureCollection.union` | 合并两个矢量要素类中相交的几何 | 管理和访问 | 1 |
| 754 | `FeatureCollection.voronoi` | 生成泰森多边形 | 几何处理 | 1 |
| 1749 | `FeatureCollection.voronoiPolygonsByQGIS` | 使用QGIS泰森多边形生成 | 几何处理 | 1 |
| 1750 | `FeatureCollection.wedgeBuffersByQGIS` | 使用QGIS楔形缓冲 | 几何处理 | 1 |
| 1819 | `Geometry.reproject` | 几何体重投影 | 投影变换 | 1 |
| 460 | `SpatialStats.BasicStatistics.AverageNearestNeighbor` | 平均最近邻分析 | 空间统计 | 1 |
| 461 | `SpatialStats.BasicStatistics.DescriptiveStatistics` | 描述性统计分析 | 空间统计 | 1 |
| 1640 | `SpatialStats.BasicStatistics.KernelDensityEstimation` | 核密度估计 | 空间统计 | 1 |
| 516 | `SpatialStats.BasicStatistics.PrincipalComponentAnalysis` | 主成分分析 | 空间统计 | 1 |
| 535 | `SpatialStats.BasicStatistics.RipleysK` | Ripley’s K函数分析 | 空间统计 | 1 |
| 462 | `SpatialStats.STCorrelations.CorrelationAnalysis.corrMat` | 相关性矩阵计算 | 时空分析 | 1 |
| 1643 | `SpatialStats.STCorrelations.SpatialAutoCorrelation.getisOrdG` | 计算Getis-Ord G指数 | 时空分析 | 1 |
| 1641 | `SpatialStats.STCorrelations.SpatialAutoCorrelation.globalGearyC` | 计算全局吉尔里C系数 | 时空分析 | 1 |
| 463 | `SpatialStats.STCorrelations.SpatialAutoCorrelation.globalMoranI` | 计算全局莫兰指数 | 时空分析 | 1 |
| 1642 | `SpatialStats.STCorrelations.SpatialAutoCorrelation.localGearyC` | 计算局部吉尔里C系数 | 时空分析 | 1 |
| 464 | `SpatialStats.STCorrelations.SpatialAutoCorrelation.localMoranI` | 计算局部莫兰指数 | 时空分析 | 1 |
| 465 | `SpatialStats.STCorrelations.TemporalAutoCorrelation.ACF` | 计算时间自相关函数 | 时空分析 | 1 |
| 469 | `SpatialStats.SpatialRegression.LinearRegression.feature` | 线性回归特征提取 | 空间统计 | 1 |
| 536 | `SpatialStats.SpatialRegression.LogisticRegression.feature` | 逻辑回归特征提取 | 空间统计 | 1 |
| 538 | `SpatialStats.SpatialRegression.PoissonRegression.feature` | 泊松回归特征提取 | 空间统计 | 1 |
| 468 | `SpatialStats.SpatialRegression.SpatialDurbinModel.fit` | 空间杜宾模型拟合 | 空间统计 | 1 |
| 467 | `SpatialStats.SpatialRegression.SpatialErrorModel.fit` | 空间误差模型拟合 | 空间统计 | 1 |
| 466 | `SpatialStats.SpatialRegression.SpatialLagModel.fit` | 空间滞后模型拟合 | 空间统计 | 1 |

### 系统基础算法（110）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 315 | `Collection.map` | 在集合中迭代调用自定义脚本 | 集合迭代器 | 1 |
| 1800 | `ComputedObject.getbbox` | 计算输入对象的四至坐标 | 对象获取 | 1 |
| 127 | `Coverage.addStyles` | 为单景栅格数据附加上图样式 | 结果样式与输出 | 1 |
| 557 | `Coverage.export` | 导出单景栅格数据 | 结果样式与输出 | 1 |
| 424 | `Coverage.outBinByGrass` | 使用GRASS输出二值栅格 | 结果样式与输出 | 1 |
| 228 | `Coverage.outPNGByGrass` | 基于GRASS输出PNG图像 | 结果样式与输出 | 1 |
| 1517 | `CoverageArray.export` | 导出单景栅格数据数组 | 结果样式与输出 | 1 |
| 208 | `CoverageCollection.addStyles` | 为单栅格数据集合附加上图样式 | 结果样式与输出 | 1 |
| 1884 | `CoverageCollection.export` | 导出单景栅格数据集合 | 结果样式与输出 | 1 |
| 1424 | `CoverageCollection.map` | 在覆盖集合中迭代调用自定义脚本 | 集合迭代器 | 1 |
| 1674 | `Feature.addStyles` | 为矢量要素附加上图样式 | 结果样式与输出 | 1 |
| 1886 | `Feature.createFromGeojson` | 从GeoJSON构建矢量要素 | 对象构建 | 1 |
| 1889 | `Feature.createFromGeometry` | 从几何体构建矢量要素 | 对象构建 | 1 |
| 1659 | `Feature.export` | 导出矢量要素 | 结果样式与输出 | 1 |
| 394 | `FeatureCollection.addStyles` | 为矢量要素类附加上图样式 | 结果样式与输出 | 1 |
| 448 | `FeatureCollection.convertFromStringByQGIS` | 使用QGIS将GeoJSON转换矢量要素类 | 对象构建 | 1 |
| 1885 | `FeatureCollection.createFromFeature` | 从矢量要素构建矢量要素类 | 对象构建 | 1 |
| 1890 | `FeatureCollection.createFromFeatureList` | 从矢量要素集合构建矢量要素类 | 对象构建 | 1 |
| 1887 | `FeatureCollection.createFromGeojson` | 从GeoJSON构建矢量要素类 | 对象构建 | 1 |
| 1888 | `FeatureCollection.createFromGeometry` | 从几何体构建矢量要素类 | 对象构建 | 1 |
| 737 | `FeatureCollection.export` | 导出矢量要素类 | 结果样式与输出 | 1 |
| 399 | `FeatureCollection.map` | 在要素集合中迭代调用自定义脚本 | 集合迭代器 | 1 |
| 1866 | `Filter.And` | 构建与逻辑连接 | 过滤器构建 | 1 |
| 1881 | `Filter.Not` | 构建非逻辑过滤条件 | 过滤器构建 | 1 |
| 1856 | `Filter.Or` | 构建或逻辑连接 | 过滤器构建 | 1 |
| 1874 | `Filter.bounds` | 构建几何边界框过滤条件 | 过滤器构建 | 1 |
| 1869 | `Filter.codeConsistency` | 构建代码一致性过滤条件 | 过滤器构建 | 1 |
| 1883 | `Filter.contains` | 构建几何包含过滤条件 | 过滤器构建 | 1 |
| 1850 | `Filter.coveredBy` | 构建几何被覆盖过滤条件 | 过滤器构建 | 1 |
| 1877 | `Filter.covers` | 构建几何覆盖过滤条件 | 过滤器构建 | 1 |
| 1879 | `Filter.crosses` | 构建几何交叉过滤条件 | 过滤器构建 | 1 |
| 1859 | `Filter.dateRange` | 构建日期区间过滤条件 | 过滤器构建 | 1 |
| 1876 | `Filter.disjoint` | 构建几何相离过滤条件 | 过滤器构建 | 1 |
| 1873 | `Filter.eq` | 构建相等过滤条件 | 过滤器构建 | 1 |
| 1854 | `Filter.equals` | 构建等于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1868 | `Filter.expression` | SQL表达式转换为条件过滤对象 | 过滤器构建 | 1 |
| 1880 | `Filter.geoEquals` | 构建几何相等过滤条件 | 过滤器构建 | 1 |
| 1862 | `Filter.greaterThan` | 构建大于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1861 | `Filter.greaterThanOrEquals` | 构建大于等于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1847 | `Filter.gt` | 构建大于过滤条件 | 过滤器构建 | 1 |
| 1849 | `Filter.gte` | 构建大于等于过滤条件 | 过滤器构建 | 1 |
| 1857 | `Filter.inList` | 构建值在列表中滤条件 | 过滤器构建 | 1 |
| 1875 | `Filter.intersects` | 构建几何相交过滤条件 | 过滤器构建 | 1 |
| 1870 | `Filter.isContained` | 构建几何被包含过滤条件 | 过滤器构建 | 1 |
| 1846 | `Filter.lessThan` | 构建小于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1855 | `Filter.lessThanOrEquals` | 构建小于等于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1858 | `Filter.listContains` | 构建列表包含值过滤条件 | 过滤器构建 | 1 |
| 1848 | `Filter.lt` | 构建小于过滤条件 | 过滤器构建 | 1 |
| 1864 | `Filter.lte` | 构建小于等于过滤条件 | 过滤器构建 | 1 |
| 1865 | `Filter.neq` | 构建不等过滤条件 | 过滤器构建 | 1 |
| 1863 | `Filter.notEquals` | 构建不等于过滤条件(支持字段比较) | 过滤器构建 | 1 |
| 1867 | `Filter.notNull` | 构建非空过滤条件 | 过滤器构建 | 1 |
| 1845 | `Filter.overlaps` | 构建几何重叠过滤条件 | 过滤器构建 | 1 |
| 1871 | `Filter.rangeContain` | 构建数值区间过滤条件 | 过滤器构建 | 1 |
| 1860 | `Filter.stringStartsWith` | 构建字符串前缀匹配过滤条件 | 过滤器构建 | 1 |
| 1872 | `Filter.toExpression` | 条件过滤对象转换为SQL表达式 | 过滤器构建 | 1 |
| 1878 | `Filter.touches` | 构建几何接触过滤条件 | 过滤器构建 | 1 |
| 1882 | `Filter.within` | 构建几何在内部过滤条件 | 过滤器构建 | 1 |
| 1779 | `Geometry.GeometryCollection` | 构建几何体集合 | 对象构建 | 1 |
| 1673 | `Geometry.LineString` | 构建线几何体 | 对象构建 | 1 |
| 1751 | `Geometry.LinearRing` | 构建线环几何体 | 对象构建 | 1 |
| 1752 | `Geometry.MultiLineString` | 构建多线几何体 | 对象构建 | 1 |
| 1687 | `Geometry.MultiPoint` | 构建多点几何体 | 对象构建 | 1 |
| 1689 | `Geometry.MultiPolygon` | 构建多面几何体 | 对象构建 | 1 |
| 1688 | `Geometry.Point` | 构建点几何体 | 对象构建 | 1 |
| 1685 | `Geometry.Polygon` | 构建面几何体 | 对象构建 | 1 |
| 1783 | `Geometry.addStyles` | 为几何体附加上图样式 | 结果样式与输出 | 1 |
| 136 | `Kernel.add` | 核加法运算 | 卷积核运算 | 1 |
| 403 | `Kernel.chebyshev` | 构建切比雪夫距离核 | 卷积核运算 | 1 |
| 404 | `Kernel.circle` | 构建圆形核 | 卷积核运算 | 1 |
| 405 | `Kernel.compass` | 构建罗盘算子核 | 卷积核运算 | 1 |
| 406 | `Kernel.diamond` | 构建菱形核 | 卷积核运算 | 1 |
| 407 | `Kernel.euclidean` | 构建欧氏距离核 | 卷积核运算 | 1 |
| 128 | `Kernel.fixed` | 构建固定权重核 | 卷积核运算 | 1 |
| 408 | `Kernel.gaussian` | 构建高斯核 | 卷积核运算 | 1 |
| 409 | `Kernel.inverse` | 构建逆距离核 | 卷积核运算 | 1 |
| 131 | `Kernel.kirsch` | 构建Kirsch算子核 | 卷积核运算 | 1 |
| 134 | `Kernel.laplacian4` | 构建四方向拉普拉斯核 | 卷积核运算 | 1 |
| 135 | `Kernel.laplacian8` | 构建八方向拉普拉斯核 | 卷积核运算 | 1 |
| 410 | `Kernel.manhattan` | 构建曼哈顿距离核 | 卷积核运算 | 1 |
| 411 | `Kernel.octagon` | 构建八角形核 | 卷积核运算 | 1 |
| 412 | `Kernel.plus` | 构建十字形核 | 卷积核运算 | 1 |
| 130 | `Kernel.prewitt` | 构建Prewitt算子核 | 卷积核运算 | 1 |
| 413 | `Kernel.rectangle` | 构建矩形核 | 卷积核运算 | 1 |
| 414 | `Kernel.roberts` | 构建Roberts算子核 | 卷积核运算 | 1 |
| 415 | `Kernel.rotate` | 核旋转运算 | 卷积核运算 | 1 |
| 132 | `Kernel.sobel` | 构建Sobel算子核 | 卷积核运算 | 1 |
| 129 | `Kernel.square` | 构建正方形核 | 卷积核运算 | 1 |
| 1622 | `MLmodel.export` | 导出机器学习模型 | 结果样式与输出 | 1 |
| 1917 | `Service.exportToServer` | Service.exportToServer | 对象获取 | 1 |
| 213 | `Service.getCoverage` | 获取单景栅格数据 | 对象获取 | 1 |
| 1427 | `Service.getCoverageArray` | 获取单景栅格数据数组 | 对象获取 | 1 |
| 1426 | `Service.getCoverageByFeature` | 按范围获取栅格数据 | 对象获取 | 1 |
| 212 | `Service.getCoverageCollection` | 获取单景栅格数据集合 | 对象获取 | 1 |
| 2481 | `Service.getCoverageFromResult` | 获取栅格计算结果 | 对象获取 | 1 |
| 2479 | `Service.getCoverageFromSystem` | 获取系统样例栅格数据 | 对象获取 | 1 |
| 2480 | `Service.getCoverageFromUpload` | 获取用户上传的栅格数据 | 对象获取 | 1 |
| 211 | `Service.getFeature` | 获取矢量要素 | 对象获取 | 1 |
| 210 | `Service.getFeatureCollection` | 获取矢量要素类 | 对象获取 | 1 |
| 2484 | `Service.getFeatureCollectionFromResult` | 获取矢量计算结果 | 对象获取 | 1 |
| 2482 | `Service.getFeatureCollectionFromSystem` | 获取系统样例矢量数据 | 对象获取 | 1 |
| 2483 | `Service.getFeatureCollectionFromUpload` | 获取用户上传的矢量数据 | 对象获取 | 1 |
| 1623 | `Service.getModel` | 获取机器学习模型 | 对象获取 | 1 |
| 1656 | `Service.getOnlineCoverage` | 获取在线底图栅格数据 | 对象获取 | 1 |
| 215 | `Service.getProcess` | 获取算法 | 对象获取 | 1 |
| 1916 | `Service.loadFileToLocal` | Service.loadFileToLocal | 对象获取 | 1 |
| 1423 | `Service.printList` | 打印列表 | 打印与调试 | 1 |
| 1420 | `Service.printNumber` | 打印数值 | 打印与调试 | 1 |
| 1548 | `Service.printSheet` | 打印工作表 | 打印与调试 | 1 |
| 558 | `Service.printString` | 打印文本 | 打印与调试 | 1 |

### 机器学习算法（50）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 1456 | `Coverage.KMeansClassificationByOTB` | 使用OTB K均值分类 | 非监督聚类 | 1 |
| 1561 | `Coverage.RandomForestTrainAndRegress` | 随机森林训练与回归 | 空间回归模型 | 1 |
| 1615 | `Coverage.binaryClassificationEvaluator` | 二分类评估器 | 模型评估 | 1 |
| 1605 | `Coverage.bisectingKMeans` | 二分K均值聚类 | 非监督聚类 | 1 |
| 1611 | `Coverage.clusteringEvaluator` | 聚类评估器 | 模型评估 | 1 |
| 1569 | `Coverage.decisionTreeClassifierModel` | 决策树分类模型 | 空间分类模型 | 1 |
| 1591 | `Coverage.decisionTreeRegressionModel` | 决策树回归模型 | 空间回归模型 | 1 |
| 1607 | `Coverage.gaussianMixture` | 高斯混合模型聚类 | 非监督聚类 | 1 |
| 1589 | `Coverage.generalizedLinearRegressionModel` | 广义线性回归模型 | 空间回归模型 | 1 |
| 1595 | `Coverage.isotonicRegressionModel` | 保序回归模型 | 空间回归模型 | 1 |
| 1540 | `Coverage.kMeans` | K均值聚类 | 非监督聚类 | 1 |
| 1603 | `Coverage.latentDirichletAllocation` | 隐狄利克雷分配 | 非监督聚类 | 1 |
| 1587 | `Coverage.linearRegressionModel` | 线性回归模型 | 空间回归模型 | 1 |
| 1575 | `Coverage.linearSVCClassifierModel` | 线性SVC分类模型 | 空间分类模型 | 1 |
| 1567 | `Coverage.logisticRegressionClassifierModel` | 逻辑回归分类模型 | 空间分类模型 | 1 |
| 1601 | `Coverage.mlKMeans` | 机器学习K均值聚类 | 非监督聚类 | 1 |
| 1583 | `Coverage.modelClassify` | 模型分类预测 | 空间分类模型 | 1 |
| 1599 | `Coverage.modelRegress` | 模型回归预测 | 空间回归模型 | 1 |
| 1609 | `Coverage.multiclassClassificationEvaluator` | 多分类评估器 | 模型评估 | 1 |
| 1613 | `Coverage.multilabelClassificationEvaluator` | 多标签分类评估器 | 模型评估 | 1 |
| 1577 | `Coverage.naiveBayesClassifierModel` | 朴素贝叶斯分类模型 | 空间分类模型 | 1 |
| 1581 | `Coverage.oneVsRestClassifierModel` | 一对多分类模型 | 空间分类模型 | 1 |
| 1565 | `Coverage.randomForestClassifierModel` | 随机森林分类模型 | 空间分类模型 | 1 |
| 1585 | `Coverage.randomForestRegressionModel` | 随机森林回归模型 | 空间回归模型 | 1 |
| 1619 | `Coverage.rankingEvaluator` | 排序评估器 | 模型评估 | 1 |
| 1617 | `Coverage.regressionEvaluator` | 回归评估器 | 模型评估 | 1 |
| 1616 | `FeatureCollection.binaryClassificationEvaluator` | 二分类评估器 | 模型评估 | 1 |
| 1606 | `FeatureCollection.bisectingKMeans` | 二分K均值聚类 | 非监督聚类 | 1 |
| 1612 | `FeatureCollection.clusteringEvaluator` | 聚类评估器 | 模型评估 | 1 |
| 1795 | `FeatureCollection.decisionTreeClassifierModel` | 决策树分类模型 | 空间分类模型 | 1 |
| 1791 | `FeatureCollection.decisionTreeRegressionModel` | 决策树回归模型 | 空间回归模型 | 1 |
| 1787 | `FeatureCollection.fmRegressionModel` | FM回归模型 | 空间回归模型 | 1 |
| 1608 | `FeatureCollection.gaussianMixture` | 高斯混合模型聚类 | 非监督聚类 | 1 |
| 1797 | `FeatureCollection.gbtRegressionModel` | 梯度提升树回归模型 | 空间回归模型 | 1 |
| 1793 | `FeatureCollection.generalizedLinearRegressionModel` | 广义线性回归模型 | 空间回归模型 | 1 |
| 1788 | `FeatureCollection.isotonicRegressionModel` | 保序回归模型 | 空间回归模型 | 1 |
| 1604 | `FeatureCollection.latentDirichletAllocation` | 隐狄利克雷分配 | 非监督聚类 | 1 |
| 1789 | `FeatureCollection.linearRegressionModel` | 线性回归模型 | 空间回归模型 | 1 |
| 1796 | `FeatureCollection.logisticRegressionClassifierModel` | 逻辑回归分类模型 | 空间分类模型 | 1 |
| 1602 | `FeatureCollection.mlKMeans` | 机器学习K均值聚类 | 非监督聚类 | 1 |
| 1784 | `FeatureCollection.modelClassify` | 模型分类预测 | 空间分类模型 | 1 |
| 1794 | `FeatureCollection.modelRegress` | 模型回归预测 | 空间回归模型 | 1 |
| 1610 | `FeatureCollection.multiclassClassificationEvaluator` | 多分类评估器 | 模型评估 | 1 |
| 1614 | `FeatureCollection.multilabelClassificationEvaluator` | 多标签分类评估器 | 模型评估 | 1 |
| 1578 | `FeatureCollection.naiveBayesClassifierModel` | 朴素贝叶斯分类模型 | 空间分类模型 | 1 |
| 1582 | `FeatureCollection.oneVsRestClassifierModel` | 一对多分类模型 | 空间分类模型 | 1 |
| 1785 | `FeatureCollection.randomForestClassifierModel` | 随机森林分类模型 | 空间分类模型 | 1 |
| 1792 | `FeatureCollection.randomForestRegressionModel` | 随机森林回归模型 | 空间回归模型 | 1 |
| 1620 | `FeatureCollection.rankingEvaluator` | 排序评估器 | 模型评估 | 1 |
| 1618 | `FeatureCollection.regressionEvaluator` | 回归评估器 | 模型评估 | 1 |

### 地形分析算法（33）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 236 | `Coverage.aspectByGDAL` | 使用GDAL坡向计算 | 地形分析 | 1 |
| 237 | `Coverage.aspectByQGIS` | 使用QGIS坡向计算 | 地形分析 | 1 |
| 299 | `Coverage.contourByGDAL` | 使用GDAL等高线生成 | 地形分析 | 1 |
| 300 | `Coverage.contourPolygonByGDAL` | 使用GDAL等高线面生成 | 地形分析 | 1 |
| 336 | `Coverage.gradient` | 梯度计算 | 地形分析 | 1 |
| 304 | `Coverage.hillShadeByGDAL` | 使用GDAL山体阴影 | 地形分析 | 1 |
| 307 | `Coverage.roughnessByGDAL` | 使用GDAL粗糙度计算 | 地形分析 | 1 |
| 245 | `Coverage.ruggednessIndexByQGIS` | 使用QGIS地形粗糙度指数 | 地形分析 | 1 |
| 433 | `Coverage.shadeByGrass` | 使用GRASS阴影分析 | 地形分析 | 1 |
| 308 | `Coverage.slopeByGDAL` | 使用GDAL坡度计算 | 地形分析 | 1 |
| 246 | `Coverage.slopeByQGIS` | 使用QGIS坡度计算 | 地形分析 | 1 |
| 232 | `Coverage.sunmaskByGrass` | 使用GRASS太阳掩膜 | 地形分析 | 1 |
| 438 | `Coverage.terrAspect` | 地形坡向计算 | 地形分析 | 1 |
| 455 | `Coverage.terrChannelnetwork` | 河网提取 | 水文分析 | 1 |
| 439 | `Coverage.terrCurvature` | 地形曲率计算 | 地形分析 | 1 |
| 485 | `Coverage.terrFeatureSelect` | 地形特征选择 | 地形分析 | 1 |
| 456 | `Coverage.terrFilter` | 地形滤波 | 地形分析 | 1 |
| 481 | `Coverage.terrFlowConnectivity` | 水流连通性分析 | 水文分析 | 1 |
| 482 | `Coverage.terrFlowLength` | 水流长度计算 | 水文分析 | 1 |
| 483 | `Coverage.terrFlowWidth` | 水流宽度计算 | 水文分析 | 1 |
| 454 | `Coverage.terrFlowaccumulation` | 汇流累积量计算 | 水文分析 | 1 |
| 453 | `Coverage.terrFlowdirection` | 流向分析 | 水文分析 | 1 |
| 442 | `Coverage.terrHillshade` | 山体阴影计算 | 地形分析 | 1 |
| 452 | `Coverage.terrPiteliminator` | 洼地消除 | 水文分析 | 1 |
| 451 | `Coverage.terrPitrouter` | 洼地路由 | 水文分析 | 1 |
| 440 | `Coverage.terrRuggedness` | 地形粗糙度计算 | 地形分析 | 1 |
| 437 | `Coverage.terrSlope` | 地形坡度计算 | 地形分析 | 1 |
| 441 | `Coverage.terrSlopelength` | 坡长计算 | 地形分析 | 1 |
| 480 | `Coverage.terrStrahlerOrder` | 斯特拉勒河流分级 | 水文分析 | 1 |
| 484 | `Coverage.terrWatershedBasins` | 流域盆地划分 | 水文分析 | 1 |
| 309 | `Coverage.tpiTopographicPositionIndexByGDAL` | 使用GDAL地形位置指数 | 地形分析 | 1 |
| 310 | `Coverage.triTerrainRuggednessIndexByGDAL` | 使用GDAL地形崎岖指数 | 地形分析 | 1 |
| 436 | `Coverage.viewshedByGrass` | 使用GRASS视域分析 | 地形分析 | 1 |

### 遥感AI模型（30）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 1910 | `2026081502.2026081502` | 桉树倒伏区域监测 | 遥感AI模型 | 2 |
| 1909 | `2026081601.2026081601` | 桉树幼苗存活识别与统计 | 遥感AI模型 | 2 |
| 1898 | `HY_AquaculturePond` | 养殖坑塘识别 | 海阳时空智能基座 | 2 |
| 1904 | `HY_BuildingChange` | 建筑变化检测 | 海阳时空智能基座 | 2 |
| 1903 | `HY_BuildingDetection` | 建筑识别 | 海阳时空智能基座 | 2 |
| 1905 | `HY_ChangeDetection` | 变化检测 | 海阳时空智能基座 | 2 |
| 1901 | `HY_Cropland` | 耕地识别 | 海阳时空智能基座 | 2 |
| 1900 | `HY_Greenhouse` | 温室大棚识别 | 海阳时空智能基座 | 2 |
| 1902 | `HY_Mariculture` | 海上养殖区识别 | 海阳时空智能基座 | 2 |
| 1899 | `HY_PhotovoltaicPanel` | 光伏面板识别 | 海阳时空智能基座 | 2 |
| 1906 | `HY_ShipDetection` | 船只检测 | 海阳时空智能基座 | 2 |
| 1908 | `HY_WindTurbDetection` | 海上风机识别 | 海阳时空智能基座 | 2 |
| 1912 | `gn.liefeng` | 地裂缝检测 | 遥感AI模型 | 2 |
| 1895 | `ogeai/songxc/de` | 松线虫疫木识别 | 遥感AI模型 | 2 |
| 1896 | `ogeai/uav_pv/seg` | 屋顶光伏提取 | 遥感AI模型 | 2 |
| 1913 | `sd.maskcd` | 通用变化检测模型模型 | 遥感AI模型 | 2 |
| 1915 | `sd.uav_obejct_detction` | 无人机目标识别模型 | 遥感AI模型 | 2 |
| 1914 | `sd.uavluccseg` | 无人机影像土地利用分类模型 | 遥感AI模型 | 2 |
| 1911 | `sd.wheat_maize` | 多时相小麦玉米提取模型 | 遥感AI模型 | 2 |
| 1801 | `tdt_building_seg` | 天地图建筑提取模型 | 天地图遥感AI模型 | 2 |
| 1802 | `tdt_farm_seg` | 天地图耕地提取模型 | 天地图遥感AI模型 | 2 |
| 1803 | `tdt_water_seg` | 天地图水体提取模型 | 天地图遥感AI模型 | 2 |
| 1665 | `whu-cultivated_land` | 耕地提取 | 武汉一号遥感AI模型 | 2 |
| 1663 | `whu-greenhouse` | 大棚提取 | 武汉一号遥感AI模型 | 2 |
| 1664 | `whu-mainroad` | 主干道提取 | 武汉一号遥感AI模型 | 2 |
| 1666 | `whu-playground` | 操场检测 | 武汉一号遥感AI模型 | 2 |
| 1667 | `whu-ship` | 船舶检测 | 武汉一号遥感AI模型 | 2 |
| 1657 | `whu01_buildtop` | 屋顶提取 | 武汉一号遥感AI模型 | 2 |
| 1668 | `whu01_plane` | 飞机检测 | 武汉一号遥感AI模型 | 2 |
| 1658 | `whu01_water` | 水体提取 | 武汉一号遥感AI模型 | 2 |

### 地学分析算法（24）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 1421 | `Coverage.geoDetector` | 地理探测器分析 | 空间探测 | 1 |
| 736 | `FeatureCollection.idwInterpolation` | 反距离加权插值 | 空间插值 | 1 |
| 734 | `FeatureCollection.simpleKriging` | 简单克里金插值 | 空间插值 | 1 |
| 546 | `SpatialStats.GWModels.GTWR.autoFit` | 时空地理加权回归自动拟合 | 地理加权 | 1 |
| 547 | `SpatialStats.GWModels.GTWR.fit` | 时空地理加权回归拟合 | 地理加权 | 1 |
| 470 | `SpatialStats.GWModels.GWAverage` | 地理加权平均 | 地理加权 | 1 |
| 471 | `SpatialStats.GWModels.GWCorrelation` | 地理加权相关 | 地理加权 | 1 |
| 548 | `SpatialStats.GWModels.GWDA.calculate` | 地理加权判别分析计算 | 地理加权 | 1 |
| 764 | `SpatialStats.GWModels.GWPCA` | 地理加权主成分分析 | 地理加权 | 1 |
| 762 | `SpatialStats.GWModels.GWRGeneralized.fit` | 广义地理加权回归拟合 | 地理加权 | 1 |
| 459 | `SpatialStats.GWModels.GWRbasic.auto` | 基础地理加权回归自动优化 | 地理加权 | 1 |
| 457 | `SpatialStats.GWModels.GWRbasic.autoFit` | 基础地理加权回归自动拟合 | 地理加权 | 1 |
| 458 | `SpatialStats.GWModels.GWRbasic.fit` | 基础地理加权回归拟合 | 地理加权 | 1 |
| 474 | `SpatialStats.SpatialHeterogeneity.GeoEcologicalDetector` | 地理生态探测器 | 空间探测 | 1 |
| 472 | `SpatialStats.SpatialHeterogeneity.GeoFactorDetector` | 地理因子探测器 | 空间探测 | 1 |
| 473 | `SpatialStats.SpatialHeterogeneity.GeoInteractionDetector` | 地理交互探测器 | 空间探测 | 1 |
| 475 | `SpatialStats.SpatialHeterogeneity.GeoRiskDetector` | 地理风险探测器 | 空间探测 | 1 |
| 1648 | `SpatialStats.SpatialInterpolation.IDW.fit` | 反距离加权插值拟合 | 空间插值 | 1 |
| 1644 | `SpatialStats.SpatialInterpolation.LinearInterpolation.fit` | 线性插值拟合 | 空间插值 | 1 |
| 1647 | `SpatialStats.SpatialInterpolation.NearestNeighbourInterpolation.fit` | 最近邻插值拟合 | 空间插值 | 1 |
| 543 | `SpatialStats.SpatialInterpolation.OrdinaryKriging` | 普通克里金插值 | 空间插值 | 1 |
| 1646 | `SpatialStats.SpatialInterpolation.SplineInterpolation.BSpline` | B样条插值 | 空间插值 | 1 |
| 1645 | `SpatialStats.SpatialInterpolation.SplineInterpolation.thinPlateSpline` | 薄板样条插值 | 空间插值 | 1 |
| 544 | `SpatialStats.SpatialInterpolation.selfDefinedKriging` | 自定义克里金插值 | 空间插值 | 1 |

### 其它（10）

| ID | 算子 | 名称 | 子分类 | type |
| ---: | --- | --- | --- | ---: |
| 664 | `Feature.load` | 根据几何元信息加载要素 | 其它 | 1 |
| 662 | `Feature.loadFeatureFromUpload` | 根据上传的 GeoJSON 文件构造要素 | 其它 | 1 |
| 670 | `Feature.loadFromGeojson` | 根据GeoJSON构造要素 | 其它 | 1 |
| 665 | `Feature.loadFromGeometry` | 根据几何构造要素 | 其它 | 1 |
| 1760 | `FeatureCollection.load` | FeatureCollection.load | 其它 | 1 |
| 1681 | `FeatureCollection.loadFeatureCollectionFromUpload` | 从上传文件加载要素集合 | 其它 | 1 |
| 1660 | `FeatureCollection.loadFromFeature` | FeatureCollection.loadFromFeature | 其它 | 1 |
| 1686 | `FeatureCollection.loadFromFeatureList` | 从Feature列表加载FeatureCollection | 其它 | 1 |
| 1721 | `FeatureCollection.loadFromGeojson` | FeatureCollection.loadFromGeojson | 其它 | 1 |
| 1679 | `FeatureCollection.loadFromGeometry` | 从几何对象矢量要素集 | 其它 | 1 |
