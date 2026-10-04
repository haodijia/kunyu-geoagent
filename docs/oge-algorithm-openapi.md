# OGE 算子包一览

> 来源：`POST /model/listByTags4Catalog`（2026-09-29）。  
> 当前开放平台已发布、可用 `tk` 执行的算法是 `Coverage.terrAspect`：`POST /openapi/algorithm/Coverage/terrAspect/execute`。  
> 下表是算法中心的算子名录。未带包名的算子路径为 `/openapi/algorithm/{name}/execute`。

共 **624** 条。

| 包 | 数量 |
|---|---|
| Coverage | 247 |
| FeatureCollection | 165 |
| Feature | 46 |
| SpatialStats | 43 |
| Filter | 30 |
| (no package) | 23 |
| Kernel | 21 |
| Service | 15 |
| CoverageCollection | 13 |
| Geometry | 10 |
| sd | 4 |
| 2026081502 | 1 |
| 2026081601 | 1 |
| Collection | 1 |
| ComputedObject | 1 |
| CoverageArray | 1 |
| gn | 1 |
| MLmodel | 1 |

## Coverage (247)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Coverage.abs | 绝对值运算 | /openapi/algorithm/Coverage/abs/execute |
| Coverage.acos | 反余弦运算 | /openapi/algorithm/Coverage/acos/execute |
| Coverage.add | 加法运算 | /openapi/algorithm/Coverage/add/execute |
| Coverage.addBands | 添加波段 | /openapi/algorithm/Coverage/addBands/execute |
| Coverage.addNum | 加常数运算 | /openapi/algorithm/Coverage/addNum/execute |
| Coverage.addStyles | 为单景栅格数据附加上图样式 | /openapi/algorithm/Coverage/addStyles/execute |
| Coverage.and | 逻辑与运算 | /openapi/algorithm/Coverage/and/execute |
| Coverage.area | 栅格有效面积计算 | /openapi/algorithm/Coverage/area/execute |
| Coverage.asin | 反正弦运算 | /openapi/algorithm/Coverage/asin/execute |
| Coverage.aspectByGDAL | 使用GDAL坡向计算 | /openapi/algorithm/Coverage/aspectByGDAL/execute |
| Coverage.aspectByQGIS | 使用QGIS坡向计算 | /openapi/algorithm/Coverage/aspectByQGIS/execute |
| Coverage.assignProjectionByGDAL | 使用GDAL指定投影 | /openapi/algorithm/Coverage/assignProjectionByGDAL/execute |
| Coverage.atan | 反正切运算 | /openapi/algorithm/Coverage/atan/execute |
| Coverage.atan2 | 双参数反正切运算 | /openapi/algorithm/Coverage/atan2/execute |
| Coverage.atmosphericCorrectionByOTB | 使用OTB大气校正 | /openapi/algorithm/Coverage/atmosphericCorrectionByOTB/execute |
| Coverage.bandNames | 获取所有波段名称 | /openapi/algorithm/Coverage/bandNames/execute |
| Coverage.bandNum | 获取波段数量 | /openapi/algorithm/Coverage/bandNum/execute |
| Coverage.bandTypes | 获取所有波段像元类型 | /openapi/algorithm/Coverage/bandTypes/execute |
| Coverage.bilateralFilter | 双边滤波 | /openapi/algorithm/Coverage/bilateralFilter/execute |
| Coverage.binarization | 二值化处理 | /openapi/algorithm/Coverage/binarization/execute |
| Coverage.binaryClassificationEvaluator | 二分类评估器 | /openapi/algorithm/Coverage/binaryClassificationEvaluator/execute |
| Coverage.bisectingKMeans | 二分K均值聚类 | /openapi/algorithm/Coverage/bisectingKMeans/execute |
| Coverage.bitwiseAnd | 按位与运算 | /openapi/algorithm/Coverage/bitwiseAnd/execute |
| Coverage.bitwiseNot | 按位非运算 | /openapi/algorithm/Coverage/bitwiseNot/execute |
| Coverage.bitwiseOr | 按位或运算 | /openapi/algorithm/Coverage/bitwiseOr/execute |
| Coverage.bitwiseXor | 按位异或运算 | /openapi/algorithm/Coverage/bitwiseXor/execute |
| Coverage.blendByGrass | 基于GRASS混合叠加 | /openapi/algorithm/Coverage/blendByGrass/execute |
| Coverage.broveyFusion | Brovey变换融合 | /openapi/algorithm/Coverage/broveyFusion/execute |
| Coverage.bufferByGrass | 基于GRASS栅格缓冲 | /openapi/algorithm/Coverage/bufferByGrass/execute |
| Coverage.calLSWI | 陆地表面水分指数计算 | /openapi/algorithm/Coverage/calLSWI/execute |
| Coverage.calNDVI | 归一化植被指数计算 | /openapi/algorithm/Coverage/calNDVI/execute |
| Coverage.calNPP | 植被生产力计算 | /openapi/algorithm/Coverage/calNPP/execute |
| Coverage.cannyEdgeDetection | Canny边缘检测 | /openapi/algorithm/Coverage/cannyEdgeDetection/execute |
| Coverage.cat | 拼接覆盖数据 | /openapi/algorithm/Coverage/cat/execute |
| Coverage.catTwoCoverage | 拼接两个覆盖数据 | /openapi/algorithm/Coverage/catTwoCoverage/execute |
| Coverage.cbrt | 立方根运算 | /openapi/algorithm/Coverage/cbrt/execute |
| Coverage.ceil | 向上取整 | /openapi/algorithm/Coverage/ceil/execute |
| Coverage.clamp | 数值钳制 | /openapi/algorithm/Coverage/clamp/execute |
| Coverage.clip | 裁剪 | /openapi/algorithm/Coverage/clip/execute |
| Coverage.clipRasterByExtentByGDAL | 基于GDAL按范围裁剪栅格 | /openapi/algorithm/Coverage/clipRasterByExtentByGDAL/execute |
| Coverage.clipRasterByMaskLayerByGDAL | 基于GDAL按掩膜层裁剪栅格 | /openapi/algorithm/Coverage/clipRasterByMaskLayerByGDAL/execute |
| Coverage.clusteringEvaluator | 聚类评估器 | /openapi/algorithm/Coverage/clusteringEvaluator/execute |
| Coverage.coinByGrass | 使用GRASS重合度分析 | /openapi/algorithm/Coverage/coinByGrass/execute |
| Coverage.compositeByGrass | 基于GRASS复合运算 | /openapi/algorithm/Coverage/compositeByGrass/execute |
| Coverage.contourByGDAL | 使用GDAL等高线生成 | /openapi/algorithm/Coverage/contourByGDAL/execute |
| Coverage.contourPolygonByGDAL | 使用GDAL等高线面生成 | /openapi/algorithm/Coverage/contourPolygonByGDAL/execute |
| Coverage.convolve | 执行指定卷积运算 | /openapi/algorithm/Coverage/convolve/execute |
| Coverage.cos | 余弦运算 | /openapi/algorithm/Coverage/cos/execute |
| Coverage.cosh | 双曲余弦运算 | /openapi/algorithm/Coverage/cosh/execute |
| Coverage.crossByGrass | 使用GRASS交叉表分析 | /openapi/algorithm/Coverage/crossByGrass/execute |
| Coverage.date | 获取单景成像日期 | /openapi/algorithm/Coverage/date/execute |
| Coverage.decisionTreeClassifierModel | 决策树分类模型 | /openapi/algorithm/Coverage/decisionTreeClassifierModel/execute |
| Coverage.decisionTreeRegressionModel | 决策树回归模型 | /openapi/algorithm/Coverage/decisionTreeRegressionModel/execute |
| Coverage.dilate | 膨胀运算 | /openapi/algorithm/Coverage/dilate/execute |
| Coverage.dimensionalityReductionByOTB | 使用OTB降维处理 | /openapi/algorithm/Coverage/dimensionalityReductionByOTB/execute |
| Coverage.divide | 除法运算 | /openapi/algorithm/Coverage/divide/execute |
| Coverage.divideNum | 除常数运算 | /openapi/algorithm/Coverage/divideNum/execute |
| Coverage.edgeExtractionByOTB | 使用OTB边缘提取 | /openapi/algorithm/Coverage/edgeExtractionByOTB/execute |
| Coverage.entropy | 熵值计算 | /openapi/algorithm/Coverage/entropy/execute |
| Coverage.eq | 相等比较 | /openapi/algorithm/Coverage/eq/execute |
| Coverage.erosion | 腐蚀运算 | /openapi/algorithm/Coverage/erosion/execute |
| Coverage.export | 导出单景栅格数据 | /openapi/algorithm/Coverage/export/execute |
| Coverage.fillNodataByGDAL | 基于GDAL填充无效值 | /openapi/algorithm/Coverage/fillNodataByGDAL/execute |
| Coverage.fillnullByGrass | 基于GRASS空值填充 | /openapi/algorithm/Coverage/fillnullByGrass/execute |
| Coverage.filter | 通用滤波 | /openapi/algorithm/Coverage/filter/execute |
| Coverage.floor | 向下取整 | /openapi/algorithm/Coverage/floor/execute |
| Coverage.focalMax | 焦点最大值滤波 | /openapi/algorithm/Coverage/focalMax/execute |
| Coverage.focalMean | 焦点均值滤波 | /openapi/algorithm/Coverage/focalMean/execute |
| Coverage.focalMedian | 焦点中值滤波 | /openapi/algorithm/Coverage/focalMedian/execute |
| Coverage.focalMin | 焦点最小值滤波 | /openapi/algorithm/Coverage/focalMin/execute |
| Coverage.focalMode | 焦点众数滤波 | /openapi/algorithm/Coverage/focalMode/execute |
| Coverage.gaussianBlur | 高斯模糊 | /openapi/algorithm/Coverage/gaussianBlur/execute |
| Coverage.gaussianMixture | 高斯混合模型聚类 | /openapi/algorithm/Coverage/gaussianMixture/execute |
| Coverage.generalizedLinearRegressionModel | 广义线性回归模型 | /openapi/algorithm/Coverage/generalizedLinearRegressionModel/execute |
| Coverage.geoDetector | 地理探测器分析 | /openapi/algorithm/Coverage/geoDetector/execute |
| Coverage.geometricCorrection | 几何校正 | /openapi/algorithm/Coverage/geometricCorrection/execute |
| Coverage.GLCM | 灰度共生矩阵纹理分析 | /openapi/algorithm/Coverage/GLCM/execute |
| Coverage.gradient | 梯度计算 | /openapi/algorithm/Coverage/gradient/execute |
| Coverage.gridAverageByGDAL | 基于GDAL网格平均插值 | /openapi/algorithm/Coverage/gridAverageByGDAL/execute |
| Coverage.gridDataMetricsByGDAL | 基于GDAL网格数据度量 | /openapi/algorithm/Coverage/gridDataMetricsByGDAL/execute |
| Coverage.gridInverseDistanceByGDAL | 基于GDAL反距离加权插值 | /openapi/algorithm/Coverage/gridInverseDistanceByGDAL/execute |
| Coverage.gridInverseDistanceNNRByGDAL | 基于GDAL反距离加权最近邻插值 | /openapi/algorithm/Coverage/gridInverseDistanceNNRByGDAL/execute |
| Coverage.gridLinearByGDAL | 基于GDAL线性插值 | /openapi/algorithm/Coverage/gridLinearByGDAL/execute |
| Coverage.gridNearestNeighborByGDAL | 基于GDAL最近邻插值 | /openapi/algorithm/Coverage/gridNearestNeighborByGDAL/execute |
| Coverage.gridStatisticsForPolygonsBySAGA | 使用SAGA面域栅格统计 | /openapi/algorithm/Coverage/gridStatisticsForPolygonsBySAGA/execute |
| Coverage.growByGrass | 基于GRASS区域生长 | /openapi/algorithm/Coverage/growByGrass/execute |
| Coverage.gt | 大于比较 | /openapi/algorithm/Coverage/gt/execute |
| Coverage.gte | 大于等于比较 | /openapi/algorithm/Coverage/gte/execute |
| Coverage.hillShadeByGDAL | 使用GDAL山体阴影 | /openapi/algorithm/Coverage/hillShadeByGDAL/execute |
| Coverage.histogram | 直方图计算 | /openapi/algorithm/Coverage/histogram/execute |
| Coverage.histogramBin | 直方图分箱 | /openapi/algorithm/Coverage/histogramBin/execute |
| Coverage.histogramEqualization | 直方图均衡化 | /openapi/algorithm/Coverage/histogramEqualization/execute |
| Coverage.histogramMatchingBySAGA | 使用SAGA直方图匹配 | /openapi/algorithm/Coverage/histogramMatchingBySAGA/execute |
| Coverage.hsvToRgb | HSV转RGB色彩空间 | /openapi/algorithm/Coverage/hsvToRgb/execute |
| Coverage.IHSFusion | IHS变换融合 | /openapi/algorithm/Coverage/IHSFusion/execute |
| Coverage.ISODATAClusteringForGridsBySAGA | 使用SAGA ISODATA栅格聚类 | /openapi/algorithm/Coverage/ISODATAClusteringForGridsBySAGA/execute |
| Coverage.isotonicRegressionModel | 保序回归模型 | /openapi/algorithm/Coverage/isotonicRegressionModel/execute |
| Coverage.kMeans | K均值聚类 | /openapi/algorithm/Coverage/kMeans/execute |
| Coverage.KMeansClassificationByOTB | 使用OTB K均值分类 | /openapi/algorithm/Coverage/KMeansClassificationByOTB/execute |
| Coverage.largeScaleMeanShiftRasterByOTB | 使用OTB大尺度栅格均值漂移 | /openapi/algorithm/Coverage/largeScaleMeanShiftRasterByOTB/execute |
| Coverage.largeScaleMeanShiftVectorByOTB | 使用OTB大尺度矢量均值漂移 | /openapi/algorithm/Coverage/largeScaleMeanShiftVectorByOTB/execute |
| Coverage.latentDirichletAllocation | 隐狄利克雷分配 | /openapi/algorithm/Coverage/latentDirichletAllocation/execute |
| Coverage.latlongByGrass | 基于GRASS经纬度生成 | /openapi/algorithm/Coverage/latlongByGrass/execute |
| Coverage.linearRegressionModel | 线性回归模型 | /openapi/algorithm/Coverage/linearRegressionModel/execute |
| Coverage.linearSVCClassifierModel | 线性SVC分类模型 | /openapi/algorithm/Coverage/linearSVCClassifierModel/execute |
| Coverage.linearTransformation | 线性变换 | /openapi/algorithm/Coverage/linearTransformation/execute |
| Coverage.localStatisticExtractionByOTB | 使用OTB局部统计提取 | /openapi/algorithm/Coverage/localStatisticExtractionByOTB/execute |
| Coverage.log | 自然对数运算 | /openapi/algorithm/Coverage/log/execute |
| Coverage.log10 | 以10为底对数运算 | /openapi/algorithm/Coverage/log10/execute |
| Coverage.logisticRegressionClassifierModel | 逻辑回归分类模型 | /openapi/algorithm/Coverage/logisticRegressionClassifierModel/execute |
| Coverage.LST | 地表温度计算 | /openapi/algorithm/Coverage/LST/execute |
| Coverage.lt | 小于比较 | /openapi/algorithm/Coverage/lt/execute |
| Coverage.lte | 小于等于比较 | /openapi/algorithm/Coverage/lte/execute |
| Coverage.mask | 掩膜处理 | /openapi/algorithm/Coverage/mask/execute |
| Coverage.maxi | 最大值计算 | /openapi/algorithm/Coverage/maxi/execute |
| Coverage.meanShiftSmoothingByOTB | 使用OTB均值漂移平滑 | /openapi/algorithm/Coverage/meanShiftSmoothingByOTB/execute |
| Coverage.metadata | 获取单景栅格元数据 | /openapi/algorithm/Coverage/metadata/execute |
| Coverage.mini | 最小值计算 | /openapi/algorithm/Coverage/mini/execute |
| Coverage.mlKMeans | 机器学习K均值聚类 | /openapi/algorithm/Coverage/mlKMeans/execute |
| Coverage.mod | 取模运算 | /openapi/algorithm/Coverage/mod/execute |
| Coverage.modelClassify | 模型分类预测 | /openapi/algorithm/Coverage/modelClassify/execute |
| Coverage.modelRegress | 模型回归预测 | /openapi/algorithm/Coverage/modelRegress/execute |
| Coverage.modNum | 对常数取模 | /openapi/algorithm/Coverage/modNum/execute |
| Coverage.multiclassClassificationEvaluator | 多分类评估器 | /openapi/algorithm/Coverage/multiclassClassificationEvaluator/execute |
| Coverage.multilabelClassificationEvaluator | 多标签分类评估器 | /openapi/algorithm/Coverage/multilabelClassificationEvaluator/execute |
| Coverage.multiply | 乘法运算 | /openapi/algorithm/Coverage/multiply/execute |
| Coverage.multiplyNum | 乘常数运算 | /openapi/algorithm/Coverage/multiplyNum/execute |
| Coverage.multivariateAlterationDetectorByOTB | 使用OTB多元变化检测 | /openapi/algorithm/Coverage/multivariateAlterationDetectorByOTB/execute |
| Coverage.naiveBayesClassifierModel | 朴素贝叶斯分类模型 | /openapi/algorithm/Coverage/naiveBayesClassifierModel/execute |
| Coverage.NDBI | 归一化建筑指数 | /openapi/algorithm/Coverage/NDBI/execute |
| Coverage.NDSSI | 归一化悬浮泥沙指数 | /openapi/algorithm/Coverage/NDSSI/execute |
| Coverage.NDVI | 归一化植被指数 | /openapi/algorithm/Coverage/NDVI/execute |
| Coverage.NDWI | 归一化水体指数 | /openapi/algorithm/Coverage/NDWI/execute |
| Coverage.nearBlackByGDAL | 基于GDAL近黑色检测 | /openapi/algorithm/Coverage/nearBlackByGDAL/execute |
| Coverage.neighborsByGrass | 使用GRASS邻域分析 | /openapi/algorithm/Coverage/neighborsByGrass/execute |
| Coverage.neq | 不等比较 | /openapi/algorithm/Coverage/neq/execute |
| Coverage.normalizedDifference | 通用归一化差值计算 | /openapi/algorithm/Coverage/normalizedDifference/execute |
| Coverage.not | 逻辑非运算 | /openapi/algorithm/Coverage/not/execute |
| Coverage.obtainUTMZoneFromGeoPointByOTB | 使用OTB从地理点获取UTM分带 | /openapi/algorithm/Coverage/obtainUTMZoneFromGeoPointByOTB/execute |
| Coverage.oneVsRestClassifierModel | 一对多分类模型 | /openapi/algorithm/Coverage/oneVsRestClassifierModel/execute |
| Coverage.OpticalAtmosphericByOTB | 使用OTB光学大气校正 | /openapi/algorithm/Coverage/OpticalAtmosphericByOTB/execute |
| Coverage.or | 逻辑或运算 | /openapi/algorithm/Coverage/or/execute |
| Coverage.outBinByGrass | 使用GRASS输出二值栅格 | /openapi/algorithm/Coverage/outBinByGrass/execute |
| Coverage.outGdalByGrass | 使用GRASS通过GDAL输出栅格 | /openapi/algorithm/Coverage/outGdalByGrass/execute |
| Coverage.outPNGByGrass | 基于GRASS输出PNG图像 | /openapi/algorithm/Coverage/outPNGByGrass/execute |
| Coverage.panSharp | 全色锐化 | /openapi/algorithm/Coverage/panSharp/execute |
| Coverage.patchByGrass | 基于GRASS图斑分析 | /openapi/algorithm/Coverage/patchByGrass/execute |
| Coverage.PCA | 主成分分析 | /openapi/algorithm/Coverage/PCA/execute |
| Coverage.polygonizeByGDAL | 使用GDAL栅格矢量化 | /openapi/algorithm/Coverage/polygonizeByGDAL/execute |
| Coverage.polynomial | 多项式变换 | /openapi/algorithm/Coverage/polynomial/execute |
| Coverage.pow | 幂运算 | /openapi/algorithm/Coverage/pow/execute |
| Coverage.powNum | 常数次幂运算 | /openapi/algorithm/Coverage/powNum/execute |
| Coverage.projection | 获取单景栅格数据投影信息 | /openapi/algorithm/Coverage/projection/execute |
| Coverage.proximityByGDAL | 基于GDAL邻近度分析 | /openapi/algorithm/Coverage/proximityByGDAL/execute |
| Coverage.radiometricIndicesByOTB | 使用OTB辐射指数计算 | /openapi/algorithm/Coverage/radiometricIndicesByOTB/execute |
| Coverage.randomForestClassifierModel | 随机森林分类模型 | /openapi/algorithm/Coverage/randomForestClassifierModel/execute |
| Coverage.randomForestRegressionModel | 随机森林回归模型 | /openapi/algorithm/Coverage/randomForestRegressionModel/execute |
| Coverage.RandomForestTrainAndRegress | 随机森林训练与回归 | /openapi/algorithm/Coverage/RandomForestTrainAndRegress/execute |
| Coverage.randomSample | 随机采样 | /openapi/algorithm/Coverage/randomSample/execute |
| Coverage.rankingEvaluator | 排序评估器 | /openapi/algorithm/Coverage/rankingEvaluator/execute |
| Coverage.rasterizeOverByGDAL | 使用GDAL叠加栅格化 | /openapi/algorithm/Coverage/rasterizeOverByGDAL/execute |
| Coverage.rasterizeOverFixedValueByGDAL | 使用GDAL固定值叠加栅格化 | /openapi/algorithm/Coverage/rasterizeOverFixedValueByGDAL/execute |
| Coverage.rasterOverwrite | 栅格联合 | /openapi/algorithm/Coverage/rasterOverwrite/execute |
| Coverage.reclass | 栅格重分类 | /openapi/algorithm/Coverage/reclass/execute |
| Coverage.reduceRegion | 按区域栅格统计运算 | /openapi/algorithm/Coverage/reduceRegion/execute |
| Coverage.reduction | 栅格统计运算 | /openapi/algorithm/Coverage/reduction/execute |
| Coverage.regressionEvaluator | 回归评估器 | /openapi/algorithm/Coverage/regressionEvaluator/execute |
| Coverage.remap | 值重映射 | /openapi/algorithm/Coverage/remap/execute |
| Coverage.rename | 波段重命名 | /openapi/algorithm/Coverage/rename/execute |
| Coverage.reportByGrass | 使用GRASS报告生成 | /openapi/algorithm/Coverage/reportByGrass/execute |
| Coverage.reproject | 单景栅格数据重投影 | /openapi/algorithm/Coverage/reproject/execute |
| Coverage.resampBsplineByGrass | 使用GRASS B样条重采样 | /openapi/algorithm/Coverage/resampBsplineByGrass/execute |
| Coverage.resampFilterByGrass | 使用GRASS滤波重采样 | /openapi/algorithm/Coverage/resampFilterByGrass/execute |
| Coverage.resampInterpByGrass | 使用GRASS插值重采样 | /openapi/algorithm/Coverage/resampInterpByGrass/execute |
| Coverage.resample | 重采样 | /openapi/algorithm/Coverage/resample/execute |
| Coverage.resampleByGrass | 使用GRASS重采样 | /openapi/algorithm/Coverage/resampleByGrass/execute |
| Coverage.resampStatsByGrass | 使用GRASS统计重采样 | /openapi/algorithm/Coverage/resampStatsByGrass/execute |
| Coverage.rescaleByGrass | 基于GRASS栅格缩放 | /openapi/algorithm/Coverage/rescaleByGrass/execute |
| Coverage.rescaleRasterByQGIS | 基于QGIS栅格缩放 | /openapi/algorithm/Coverage/rescaleRasterByQGIS/execute |
| Coverage.rgbToHsv | RGB转HSV色彩空间 | /openapi/algorithm/Coverage/rgbToHsv/execute |
| Coverage.rgbToPctByGDAL | 基于GDAL RGB转调色板 | /openapi/algorithm/Coverage/rgbToPctByGDAL/execute |
| Coverage.roughnessByGDAL | 使用GDAL粗糙度计算 | /openapi/algorithm/Coverage/roughnessByGDAL/execute |
| Coverage.round | 四舍五入 | /openapi/algorithm/Coverage/round/execute |
| Coverage.ruggednessIndexByQGIS | 使用QGIS地形粗糙度指数 | /openapi/algorithm/Coverage/ruggednessIndexByQGIS/execute |
| Coverage.sampleRegions | 区域采样 | /openapi/algorithm/Coverage/sampleRegions/execute |
| Coverage.segmentationMeanshiftRasterByOTB | 使用OTB栅格均值漂移分割 | /openapi/algorithm/Coverage/segmentationMeanshiftRasterByOTB/execute |
| Coverage.segmentationMeanshiftVectorByOTB | 使用OTB矢量均值漂移分割 | /openapi/algorithm/Coverage/segmentationMeanshiftVectorByOTB/execute |
| Coverage.segmentationMprofilesdRasterByOTB | 使用OTB栅格多剖面分割 | /openapi/algorithm/Coverage/segmentationMprofilesdRasterByOTB/execute |
| Coverage.segmentationMprofilesdVectorByOTB | 使用OTB矢量多剖面分割 | /openapi/algorithm/Coverage/segmentationMprofilesdVectorByOTB/execute |
| Coverage.segmentationWatershedRasterByOTB | 使用OTB栅格分水岭分割 | /openapi/algorithm/Coverage/segmentationWatershedRasterByOTB/execute |
| Coverage.segmentationWatershedVectorByOTB | 使用OTB矢量分水岭分割 | /openapi/algorithm/Coverage/segmentationWatershedVectorByOTB/execute |
| Coverage.selectBands | 选择波段 | /openapi/algorithm/Coverage/selectBands/execute |
| Coverage.setValidDataRange | 设置有效数据范围 | /openapi/algorithm/Coverage/setValidDataRange/execute |
| Coverage.setValueRangeByPercentage | 按百分比设置值范围 | /openapi/algorithm/Coverage/setValueRangeByPercentage/execute |
| Coverage.SFSTextureExtractionByOTB | 使用OTB SFS纹理提取 | /openapi/algorithm/Coverage/SFSTextureExtractionByOTB/execute |
| Coverage.shadeByGrass | 使用GRASS阴影分析 | /openapi/algorithm/Coverage/shadeByGrass/execute |
| Coverage.sieveByGDAL | 基于GDAL碎斑过滤 | /openapi/algorithm/Coverage/sieveByGDAL/execute |
| Coverage.signum | 符号函数运算 | /openapi/algorithm/Coverage/signum/execute |
| Coverage.simpleFilterBySAGA | 使用SAGA简单滤波 | /openapi/algorithm/Coverage/simpleFilterBySAGA/execute |
| Coverage.sin | 正弦运算 | /openapi/algorithm/Coverage/sin/execute |
| Coverage.sinh | 双曲正弦运算 | /openapi/algorithm/Coverage/sinh/execute |
| Coverage.slice | 切片提取 | /openapi/algorithm/Coverage/slice/execute |
| Coverage.slopeByGDAL | 使用GDAL坡度计算 | /openapi/algorithm/Coverage/slopeByGDAL/execute |
| Coverage.slopeByQGIS | 使用QGIS坡度计算 | /openapi/algorithm/Coverage/slopeByQGIS/execute |
| Coverage.sqrt | 平方根运算 | /openapi/algorithm/Coverage/sqrt/execute |
| Coverage.standardDeviationCalculation | 标准差计算 | /openapi/algorithm/Coverage/standardDeviationCalculation/execute |
| Coverage.standardDeviationStretching | 标准差拉伸 | /openapi/algorithm/Coverage/standardDeviationStretching/execute |
| Coverage.statsByGrass | 使用GRASS统计分析 | /openapi/algorithm/Coverage/statsByGrass/execute |
| Coverage.subtract | 减法运算 | /openapi/algorithm/Coverage/subtract/execute |
| Coverage.subtractNum | 减常数运算 | /openapi/algorithm/Coverage/subtractNum/execute |
| Coverage.sunmaskByGrass | 使用GRASS太阳掩膜 | /openapi/algorithm/Coverage/sunmaskByGrass/execute |
| Coverage.supportStatsByGrass | 使用GRASS支持域统计 | /openapi/algorithm/Coverage/supportStatsByGrass/execute |
| Coverage.surfAreaByGrass | 使用GRASS表面积计算 | /openapi/algorithm/Coverage/surfAreaByGrass/execute |
| Coverage.tan | 正切运算 | /openapi/algorithm/Coverage/tan/execute |
| Coverage.tanh | 双曲正切运算 | /openapi/algorithm/Coverage/tanh/execute |
| Coverage.terrAspect | 地形坡向计算 | /openapi/algorithm/Coverage/terrAspect/execute |
| Coverage.terrChannelnetwork | 河网提取 | /openapi/algorithm/Coverage/terrChannelnetwork/execute |
| Coverage.terrCurvature | 地形曲率计算 | /openapi/algorithm/Coverage/terrCurvature/execute |
| Coverage.terrFeatureSelect | 地形特征选择 | /openapi/algorithm/Coverage/terrFeatureSelect/execute |
| Coverage.terrFilter | 地形滤波 | /openapi/algorithm/Coverage/terrFilter/execute |
| Coverage.terrFlowaccumulation | 汇流累积量计算 | /openapi/algorithm/Coverage/terrFlowaccumulation/execute |
| Coverage.terrFlowConnectivity | 水流连通性分析 | /openapi/algorithm/Coverage/terrFlowConnectivity/execute |
| Coverage.terrFlowdirection | 流向分析 | /openapi/algorithm/Coverage/terrFlowdirection/execute |
| Coverage.terrFlowLength | 水流长度计算 | /openapi/algorithm/Coverage/terrFlowLength/execute |
| Coverage.terrFlowWidth | 水流宽度计算 | /openapi/algorithm/Coverage/terrFlowWidth/execute |
| Coverage.terrHillshade | 山体阴影计算 | /openapi/algorithm/Coverage/terrHillshade/execute |
| Coverage.terrPiteliminator | 洼地消除 | /openapi/algorithm/Coverage/terrPiteliminator/execute |
| Coverage.terrPitrouter | 洼地路由 | /openapi/algorithm/Coverage/terrPitrouter/execute |
| Coverage.terrRuggedness | 地形粗糙度计算 | /openapi/algorithm/Coverage/terrRuggedness/execute |
| Coverage.terrSlope | 地形坡度计算 | /openapi/algorithm/Coverage/terrSlope/execute |
| Coverage.terrSlopelength | 坡长计算 | /openapi/algorithm/Coverage/terrSlopelength/execute |
| Coverage.terrStrahlerOrder | 斯特拉勒河流分级 | /openapi/algorithm/Coverage/terrStrahlerOrder/execute |
| Coverage.textureByGrass | 使用GRASS纹理分析 | /openapi/algorithm/Coverage/textureByGrass/execute |
| Coverage.toDouble | 将单景栅格像元类型转换为双精度浮点型 | /openapi/algorithm/Coverage/toDouble/execute |
| Coverage.toFloat | 将单景栅格像元类型转换为单精度浮点型 | /openapi/algorithm/Coverage/toFloat/execute |
| Coverage.toInt16 | 将单景栅格像元类型转换为16位整型 | /openapi/algorithm/Coverage/toInt16/execute |
| Coverage.toInt32 | 将单景栅格像元类型转换为32位整型 | /openapi/algorithm/Coverage/toInt32/execute |
| Coverage.toInt8 | 将单景栅格像元类型转换为8位整型 | /openapi/algorithm/Coverage/toInt8/execute |
| Coverage.toUint16 | 将单景栅格像元类型转换为16位无符号整型 | /openapi/algorithm/Coverage/toUint16/execute |
| Coverage.toUint8 | 将单景栅格像元类型转换为8位无符号整型 | /openapi/algorithm/Coverage/toUint8/execute |
| Coverage.tpiTopographicPositionIndexByGDAL | 使用GDAL地形位置指数 | /openapi/algorithm/Coverage/tpiTopographicPositionIndexByGDAL/execute |
| Coverage.translateByGDAL | 使用GDAL栅格平移 | /openapi/algorithm/Coverage/translateByGDAL/execute |
| Coverage.triTerrainRuggednessIndexByGDAL | 使用GDAL地形崎岖指数 | /openapi/algorithm/Coverage/triTerrainRuggednessIndexByGDAL/execute |
| Coverage.viewshedByGrass | 使用GRASS视域分析 | /openapi/algorithm/Coverage/viewshedByGrass/execute |
| Coverage.volumeByGrass | 使用GRASS体积计算 | /openapi/algorithm/Coverage/volumeByGrass/execute |
| Coverage.warpByGDAL | 使用GDAL几何变换 | /openapi/algorithm/Coverage/warpByGDAL/execute |
| Coverage.warpGeoreByGDAL | 使用GDAL地理配准变换 | /openapi/algorithm/Coverage/warpGeoreByGDAL/execute |

## FeatureCollection (165)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| FeatureCollection.addFieldByQGIS | 使用QGIS添加字段 | /openapi/algorithm/FeatureCollection/addFieldByQGIS/execute |
| FeatureCollection.addStyles | 为矢量要素类附加上图样式 | /openapi/algorithm/FeatureCollection/addStyles/execute |
| FeatureCollection.addXYFieldByQGIS | 使用QGIS添加XY坐标字段 | /openapi/algorithm/FeatureCollection/addXYFieldByQGIS/execute |
| FeatureCollection.affineTransformByQGIS | 使用QGIS仿射变换 | /openapi/algorithm/FeatureCollection/affineTransformByQGIS/execute |
| FeatureCollection.aggregateArray | 聚合为数组 | /openapi/algorithm/FeatureCollection/aggregateArray/execute |
| FeatureCollection.aggregateBounds | 聚合边界框 | /openapi/algorithm/FeatureCollection/aggregateBounds/execute |
| FeatureCollection.aggregateCount | 聚合计数 | /openapi/algorithm/FeatureCollection/aggregateCount/execute |
| FeatureCollection.aggregateCountDistinct | 聚合去重计数 | /openapi/algorithm/FeatureCollection/aggregateCountDistinct/execute |
| FeatureCollection.aggregateFirst | 聚合首值 | /openapi/algorithm/FeatureCollection/aggregateFirst/execute |
| FeatureCollection.aggregateIntersection | 聚合交集 | /openapi/algorithm/FeatureCollection/aggregateIntersection/execute |
| FeatureCollection.aggregateMax | 聚合最大值 | /openapi/algorithm/FeatureCollection/aggregateMax/execute |
| FeatureCollection.aggregateMean | 聚合均值 | /openapi/algorithm/FeatureCollection/aggregateMean/execute |
| FeatureCollection.aggregateMin | 聚合最小值 | /openapi/algorithm/FeatureCollection/aggregateMin/execute |
| FeatureCollection.aggregateProduct | 聚合乘积 | /openapi/algorithm/FeatureCollection/aggregateProduct/execute |
| FeatureCollection.aggregateSampleSD | 聚合样本标准差 | /openapi/algorithm/FeatureCollection/aggregateSampleSD/execute |
| FeatureCollection.aggregateSampleVAR | 聚合样本方差 | /openapi/algorithm/FeatureCollection/aggregateSampleVAR/execute |
| FeatureCollection.aggregateStats | 聚合统计 | /openapi/algorithm/FeatureCollection/aggregateStats/execute |
| FeatureCollection.aggregateTotalSD | 聚合总体标准差 | /openapi/algorithm/FeatureCollection/aggregateTotalSD/execute |
| FeatureCollection.aggregateTotalSum | 聚合总和 | /openapi/algorithm/FeatureCollection/aggregateTotalSum/execute |
| FeatureCollection.aggregateTotalVAR | 聚合总体方差 | /openapi/algorithm/FeatureCollection/aggregateTotalVAR/execute |
| FeatureCollection.aggregateUnion | 聚合联合 | /openapi/algorithm/FeatureCollection/aggregateUnion/execute |
| FeatureCollection.angleToNearestByQGIS | 使用QGIS最近邻角度计算 | /openapi/algorithm/FeatureCollection/angleToNearestByQGIS/execute |
| FeatureCollection.antimeridianSplitByQGIS | 使用QGIS反子午线分割 | /openapi/algorithm/FeatureCollection/antimeridianSplitByQGIS/execute |
| FeatureCollection.area | 计算面积 | /openapi/algorithm/FeatureCollection/area/execute |
| FeatureCollection.areaEllipsoid | 椭球体面积计算(基于国土三调图斑面积公式) | /openapi/algorithm/FeatureCollection/areaEllipsoid/execute |
| FeatureCollection.areaSpheroid | 测地面积计算 | /openapi/algorithm/FeatureCollection/areaSpheroid/execute |
| FeatureCollection.arrayOffsetLinesByQGIS | 使用QGIS阵列偏移线 | /openapi/algorithm/FeatureCollection/arrayOffsetLinesByQGIS/execute |
| FeatureCollection.assembleNumericArray | 将多个数值字段组装成数组字段 | /openapi/algorithm/FeatureCollection/assembleNumericArray/execute |
| FeatureCollection.assignProjectionByQGIS | 使用QGIS指定投影 | /openapi/algorithm/FeatureCollection/assignProjectionByQGIS/execute |
| FeatureCollection.binaryClassificationEvaluator | 二分类评估器 | /openapi/algorithm/FeatureCollection/binaryClassificationEvaluator/execute |
| FeatureCollection.bisectingKMeans | 二分K均值聚类 | /openapi/algorithm/FeatureCollection/bisectingKMeans/execute |
| FeatureCollection.boundary | 边界提取 | /openapi/algorithm/FeatureCollection/boundary/execute |
| FeatureCollection.boundaryByQGIS | 使用QGIS边界提取 | /openapi/algorithm/FeatureCollection/boundaryByQGIS/execute |
| FeatureCollection.buffer | 缓冲区分析 | /openapi/algorithm/FeatureCollection/buffer/execute |
| FeatureCollection.bufferVectorsByGDAL | 使用GDAL矢量缓冲 | /openapi/algorithm/FeatureCollection/bufferVectorsByGDAL/execute |
| FeatureCollection.clipVectorByExtentByGDAL | 使用GDAL按范围裁剪矢量 | /openapi/algorithm/FeatureCollection/clipVectorByExtentByGDAL/execute |
| FeatureCollection.clipVectorByPolygonByGDAL | 使用GDAL按面裁剪矢量 | /openapi/algorithm/FeatureCollection/clipVectorByPolygonByGDAL/execute |
| FeatureCollection.clusteringEvaluator | 聚类评估器 | /openapi/algorithm/FeatureCollection/clusteringEvaluator/execute |
| FeatureCollection.combine | 合并两个字段的值 | /openapi/algorithm/FeatureCollection/combine/execute |
| FeatureCollection.concaveHullByQGIS | 使用QGIS凹包生成 | /openapi/algorithm/FeatureCollection/concaveHullByQGIS/execute |
| FeatureCollection.constantColumn | 添加常量列 | /openapi/algorithm/FeatureCollection/constantColumn/execute |
| FeatureCollection.convertFromStringByQGIS | 使用QGIS将GeoJSON转换矢量要素类 | /openapi/algorithm/FeatureCollection/convertFromStringByQGIS/execute |
| FeatureCollection.convertGeometryTypeByQGIS | 使用QGIS几何类型转换 | /openapi/algorithm/FeatureCollection/convertGeometryTypeByQGIS/execute |
| FeatureCollection.createFromFeature | 从矢量要素构建矢量要素类 | /openapi/algorithm/FeatureCollection/createFromFeature/execute |
| FeatureCollection.createFromFeatureList | 从矢量要素集合构建矢量要素类 | /openapi/algorithm/FeatureCollection/createFromFeatureList/execute |
| FeatureCollection.createFromGeojson | 从GeoJSON构建矢量要素类 | /openapi/algorithm/FeatureCollection/createFromGeojson/execute |
| FeatureCollection.createFromGeometry | 从几何体构建矢量要素类 | /openapi/algorithm/FeatureCollection/createFromGeometry/execute |
| FeatureCollection.decisionTreeClassifierModel | 决策树分类模型 | /openapi/algorithm/FeatureCollection/decisionTreeClassifierModel/execute |
| FeatureCollection.decisionTreeRegressionModel | 决策树回归模型 | /openapi/algorithm/FeatureCollection/decisionTreeRegressionModel/execute |
| FeatureCollection.delaunay | 德劳内三角剖分 | /openapi/algorithm/FeatureCollection/delaunay/execute |
| FeatureCollection.delaunayTriangulationByQGIS | 使用QGIS德劳内三角剖分 | /openapi/algorithm/FeatureCollection/delaunayTriangulationByQGIS/execute |
| FeatureCollection.describe | 描述性统计 | /openapi/algorithm/FeatureCollection/describe/execute |
| FeatureCollection.difference | 差集运算 | /openapi/algorithm/FeatureCollection/difference/execute |
| FeatureCollection.differenceWithGeometry | 与几何体求差 | /openapi/algorithm/FeatureCollection/differenceWithGeometry/execute |
| FeatureCollection.dissolveByGDAL | 使用GDAL融合运算 | /openapi/algorithm/FeatureCollection/dissolveByGDAL/execute |
| FeatureCollection.distanceJoinQuery | 按限定距离一对一连接查询 | /openapi/algorithm/FeatureCollection/distanceJoinQuery/execute |
| FeatureCollection.distanceJoinQueryFlat | 按限定距离一对多连接查询 | /openapi/algorithm/FeatureCollection/distanceJoinQueryFlat/execute |
| FeatureCollection.distinct | 矢量要素类数据去重 | /openapi/algorithm/FeatureCollection/distinct/execute |
| FeatureCollection.erase | 擦除运算 | /openapi/algorithm/FeatureCollection/erase/execute |
| FeatureCollection.export | 导出矢量要素类 | /openapi/algorithm/FeatureCollection/export/execute |
| FeatureCollection.extractFromLocationByQGIS | 使用QGIS位置提取 | /openapi/algorithm/FeatureCollection/extractFromLocationByQGIS/execute |
| FeatureCollection.extractRowsAsList | 按指定字段排序后提取指定范围的记录 | /openapi/algorithm/FeatureCollection/extractRowsAsList/execute |
| FeatureCollection.filter | 条件过滤 | /openapi/algorithm/FeatureCollection/filter/execute |
| FeatureCollection.filterBounds | 按几何范围过滤 | /openapi/algorithm/FeatureCollection/filterBounds/execute |
| FeatureCollection.filterDate | 按日期过滤 | /openapi/algorithm/FeatureCollection/filterDate/execute |
| FeatureCollection.filterMetadata | 按元数据过滤 | /openapi/algorithm/FeatureCollection/filterMetadata/execute |
| FeatureCollection.fmRegressionModel | FM回归模型 | /openapi/algorithm/FeatureCollection/fmRegressionModel/execute |
| FeatureCollection.gaussianMixture | 高斯混合模型聚类 | /openapi/algorithm/FeatureCollection/gaussianMixture/execute |
| FeatureCollection.gbtRegressionModel | 梯度提升树回归模型 | /openapi/algorithm/FeatureCollection/gbtRegressionModel/execute |
| FeatureCollection.generalizedLinearRegressionModel | 广义线性回归模型 | /openapi/algorithm/FeatureCollection/generalizedLinearRegressionModel/execute |
| FeatureCollection.geoHash | 生成GeoHash编码 | /openapi/algorithm/FeatureCollection/geoHash/execute |
| FeatureCollection.geometryGetAndMerge | 获取并合并几何体 | /openapi/algorithm/FeatureCollection/geometryGetAndMerge/execute |
| FeatureCollection.groupCount | 分组计数 | /openapi/algorithm/FeatureCollection/groupCount/execute |
| FeatureCollection.groupCountDistinct | 分组去重计数 | /openapi/algorithm/FeatureCollection/groupCountDistinct/execute |
| FeatureCollection.groupMax | 分组最大值 | /openapi/algorithm/FeatureCollection/groupMax/execute |
| FeatureCollection.groupMean | 分组均值 | /openapi/algorithm/FeatureCollection/groupMean/execute |
| FeatureCollection.groupMin | 分组最小值 | /openapi/algorithm/FeatureCollection/groupMin/execute |
| FeatureCollection.groupSum | 分组求和 | /openapi/algorithm/FeatureCollection/groupSum/execute |
| FeatureCollection.idwInterpolation | 反距离加权插值 | /openapi/algorithm/FeatureCollection/idwInterpolation/execute |
| FeatureCollection.intersection | 交集运算 | /openapi/algorithm/FeatureCollection/intersection/execute |
| FeatureCollection.intersectionByFilter | 使用过滤条件参数的交集运算 | /openapi/algorithm/FeatureCollection/intersectionByFilter/execute |
| FeatureCollection.intersectionByQGIS | 使用QGIS交集运算 | /openapi/algorithm/FeatureCollection/intersectionByQGIS/execute |
| FeatureCollection.intersectionOpt | 优化交集运算 | /openapi/algorithm/FeatureCollection/intersectionOpt/execute |
| FeatureCollection.isotonicRegressionModel | 保序回归模型 | /openapi/algorithm/FeatureCollection/isotonicRegressionModel/execute |
| FeatureCollection.joinOneToManyByFilter | 基于过滤的一对多连接 | /openapi/algorithm/FeatureCollection/joinOneToManyByFilter/execute |
| FeatureCollection.joinOneToOneByFilter | 基于过滤的一对一连接 | /openapi/algorithm/FeatureCollection/joinOneToOneByFilter/execute |
| FeatureCollection.kNNQuery | K近邻查询 | /openapi/algorithm/FeatureCollection/kNNQuery/execute |
| FeatureCollection.latentDirichletAllocation | 隐狄利克雷分配 | /openapi/algorithm/FeatureCollection/latentDirichletAllocation/execute |
| FeatureCollection.length | 计算长度 | /openapi/algorithm/FeatureCollection/length/execute |
| FeatureCollection.lengthSpheroid | 测地长度计算 | /openapi/algorithm/FeatureCollection/lengthSpheroid/execute |
| FeatureCollection.limit | 返回限定数量的矢量数据 | /openapi/algorithm/FeatureCollection/limit/execute |
| FeatureCollection.linearRegressionModel | 线性回归模型 | /openapi/algorithm/FeatureCollection/linearRegressionModel/execute |
| FeatureCollection.linesToPolygonsByQGIS | 使用QGIS线转面 | /openapi/algorithm/FeatureCollection/linesToPolygonsByQGIS/execute |
| FeatureCollection.load | FeatureCollection.load | /openapi/algorithm/FeatureCollection/load/execute |
| FeatureCollection.loadFeatureCollectionFromUpload | 从上传文件加载要素集合 | /openapi/algorithm/FeatureCollection/loadFeatureCollectionFromUpload/execute |
| FeatureCollection.loadFromFeature | FeatureCollection.loadFromFeature | /openapi/algorithm/FeatureCollection/loadFromFeature/execute |
| FeatureCollection.loadFromFeatureList | 从Feature列表加载FeatureCollection | /openapi/algorithm/FeatureCollection/loadFromFeatureList/execute |
| FeatureCollection.loadFromGeojson | FeatureCollection.loadFromGeojson | /openapi/algorithm/FeatureCollection/loadFromGeojson/execute |
| FeatureCollection.loadFromGeometry | 从几何对象矢量要素集 | /openapi/algorithm/FeatureCollection/loadFromGeometry/execute |
| FeatureCollection.logisticRegressionClassifierModel | 逻辑回归分类模型 | /openapi/algorithm/FeatureCollection/logisticRegressionClassifierModel/execute |
| FeatureCollection.map | 在要素集合中迭代调用自定义脚本 | /openapi/algorithm/FeatureCollection/map/execute |
| FeatureCollection.merge | 合并输入的矢量要素类 | /openapi/algorithm/FeatureCollection/merge/execute |
| FeatureCollection.mergeAll | 合并输入的矢量要素类(大于两个) | /openapi/algorithm/FeatureCollection/mergeAll/execute |
| FeatureCollection.miniEnclosingCircleByQGIS | 使用QGIS最小外接圆 | /openapi/algorithm/FeatureCollection/miniEnclosingCircleByQGIS/execute |
| FeatureCollection.mlKMeans | 机器学习K均值聚类 | /openapi/algorithm/FeatureCollection/mlKMeans/execute |
| FeatureCollection.modelClassify | 模型分类预测 | /openapi/algorithm/FeatureCollection/modelClassify/execute |
| FeatureCollection.modelRegress | 模型回归预测 | /openapi/algorithm/FeatureCollection/modelRegress/execute |
| FeatureCollection.multiclassClassificationEvaluator | 多分类评估器 | /openapi/algorithm/FeatureCollection/multiclassClassificationEvaluator/execute |
| FeatureCollection.multilabelClassificationEvaluator | 多标签分类评估器 | /openapi/algorithm/FeatureCollection/multilabelClassificationEvaluator/execute |
| FeatureCollection.multiRingConstantBufferByQGIS | 使用QGIS多环等距缓冲 | /openapi/algorithm/FeatureCollection/multiRingConstantBufferByQGIS/execute |
| FeatureCollection.naiveBayesClassifierModel | 朴素贝叶斯分类模型 | /openapi/algorithm/FeatureCollection/naiveBayesClassifierModel/execute |
| FeatureCollection.offsetCurveByGDAL | 使用GDAL曲线偏移 | /openapi/algorithm/FeatureCollection/offsetCurveByGDAL/execute |
| FeatureCollection.offsetLineByQGIS | 使用QGIS线偏移 | /openapi/algorithm/FeatureCollection/offsetLineByQGIS/execute |
| FeatureCollection.oneSideBufferByGDAL | 使用GDAL单侧缓冲 | /openapi/algorithm/FeatureCollection/oneSideBufferByGDAL/execute |
| FeatureCollection.oneVsRestClassifierModel | 一对多分类模型 | /openapi/algorithm/FeatureCollection/oneVsRestClassifierModel/execute |
| FeatureCollection.orientedMinimumBoundingBoxByQGIS | 使用QGIS定向最小外接矩形 | /openapi/algorithm/FeatureCollection/orientedMinimumBoundingBoxByQGIS/execute |
| FeatureCollection.perimeter | 计算周长 | /openapi/algorithm/FeatureCollection/perimeter/execute |
| FeatureCollection.perimeterSpheroid | 测地周长计算 | /openapi/algorithm/FeatureCollection/perimeterSpheroid/execute |
| FeatureCollection.pointOnSurfaceByQGIS | 使用QGIS面上取点 | /openapi/algorithm/FeatureCollection/pointOnSurfaceByQGIS/execute |
| FeatureCollection.pointsAlongLinesByGDAL | 使用GDAL沿线取点 | /openapi/algorithm/FeatureCollection/pointsAlongLinesByGDAL/execute |
| FeatureCollection.pointsAlongLinesByQGIS | 使用QGIS沿线取点 | /openapi/algorithm/FeatureCollection/pointsAlongLinesByQGIS/execute |
| FeatureCollection.pointsDisplacementByQGIS | 使用QGIS点位移 | /openapi/algorithm/FeatureCollection/pointsDisplacementByQGIS/execute |
| FeatureCollection.poleOfInaccessibilityByQGIS | 使用QGIS难达极点计算 | /openapi/algorithm/FeatureCollection/poleOfInaccessibilityByQGIS/execute |
| FeatureCollection.polygonizeByQGIS | 使用QGIS线转面 | /openapi/algorithm/FeatureCollection/polygonizeByQGIS/execute |
| FeatureCollection.polygonsToLinesByQGIS | 使用QGIS面转线 | /openapi/algorithm/FeatureCollection/polygonsToLinesByQGIS/execute |
| FeatureCollection.projectPointsByQGIS | 使用QGIS点投影 | /openapi/algorithm/FeatureCollection/projectPointsByQGIS/execute |
| FeatureCollection.propertyNames | 获取矢量要素类的所有属性名 | /openapi/algorithm/FeatureCollection/propertyNames/execute |
| FeatureCollection.propertySet | 设置属性值 | /openapi/algorithm/FeatureCollection/propertySet/execute |
| FeatureCollection.randomColumn | 添加随机值列 | /openapi/algorithm/FeatureCollection/randomColumn/execute |
| FeatureCollection.randomForestClassifierModel | 随机森林分类模型 | /openapi/algorithm/FeatureCollection/randomForestClassifierModel/execute |
| FeatureCollection.randomForestRegressionModel | 随机森林回归模型 | /openapi/algorithm/FeatureCollection/randomForestRegressionModel/execute |
| FeatureCollection.randomPointsAlongLineByQGIS | 使用QGIS沿线随机取点 | /openapi/algorithm/FeatureCollection/randomPointsAlongLineByQGIS/execute |
| FeatureCollection.randomPointsInLayerBoundsByQGIS | 使用QGIS图层范围内随机取点 | /openapi/algorithm/FeatureCollection/randomPointsInLayerBoundsByQGIS/execute |
| FeatureCollection.randomPointsInPolygonsByQGIS | 使用QGIS面内随机取点 | /openapi/algorithm/FeatureCollection/randomPointsInPolygonsByQGIS/execute |
| FeatureCollection.randomPointsOnLinesByQGIS | 使用QGIS线上随机取点 | /openapi/algorithm/FeatureCollection/randomPointsOnLinesByQGIS/execute |
| FeatureCollection.rankingEvaluator | 排序评估器 | /openapi/algorithm/FeatureCollection/rankingEvaluator/execute |
| FeatureCollection.rasterize | 矢量栅格化 | /openapi/algorithm/FeatureCollection/rasterize/execute |
| FeatureCollection.rasterizeByGDAL | 使用GDAL矢量栅格化 | /openapi/algorithm/FeatureCollection/rasterizeByGDAL/execute |
| FeatureCollection.rasterSamplingByQGIS | 使用QGIS基于输入矢量要素类对栅格重采样 | /openapi/algorithm/FeatureCollection/rasterSamplingByQGIS/execute |
| FeatureCollection.rectanglesOvalsDiamondsByQGIS | 使用QGIS规则图形生成 | /openapi/algorithm/FeatureCollection/rectanglesOvalsDiamondsByQGIS/execute |
| FeatureCollection.regressionEvaluator | 回归评估器 | /openapi/algorithm/FeatureCollection/regressionEvaluator/execute |
| FeatureCollection.remap | 属性重映射 | /openapi/algorithm/FeatureCollection/remap/execute |
| FeatureCollection.reproject | 矢量要素类重投影 | /openapi/algorithm/FeatureCollection/reproject/execute |
| FeatureCollection.rotateFeaturesByQGIS | 使用QGIS要素旋转 | /openapi/algorithm/FeatureCollection/rotateFeaturesByQGIS/execute |
| FeatureCollection.sample | 数据采样 | /openapi/algorithm/FeatureCollection/sample/execute |
| FeatureCollection.select | 选择属性映射为新属性名 | /openapi/algorithm/FeatureCollection/select/execute |
| FeatureCollection.shortestPathPointToPointByQGIS | 使用QGIS点对点最短路径 | /openapi/algorithm/FeatureCollection/shortestPathPointToPointByQGIS/execute |
| FeatureCollection.simpleKriging | 简单克里金插值 | /openapi/algorithm/FeatureCollection/simpleKriging/execute |
| FeatureCollection.simplifyByQGIS | 使用QGIS几何简化 | /openapi/algorithm/FeatureCollection/simplifyByQGIS/execute |
| FeatureCollection.singleSidedBufferByQGIS | 使用QGIS单侧缓冲 | /openapi/algorithm/FeatureCollection/singleSidedBufferByQGIS/execute |
| FeatureCollection.size | 集合大小 | /openapi/algorithm/FeatureCollection/size/execute |
| FeatureCollection.smoothByQGIS | 使用QGIS几何平滑 | /openapi/algorithm/FeatureCollection/smoothByQGIS/execute |
| FeatureCollection.sortAndSplit | 矢量要素类排序重分区 | /openapi/algorithm/FeatureCollection/sortAndSplit/execute |
| FeatureCollection.spatialJoinOneToOne | 一对一空间连接 | /openapi/algorithm/FeatureCollection/spatialJoinOneToOne/execute |
| FeatureCollection.spatialPredicateQuery | 空间查询 | /openapi/algorithm/FeatureCollection/spatialPredicateQuery/execute |
| FeatureCollection.subtract | 对矢量要素类中的两列进行减法运算 | /openapi/algorithm/FeatureCollection/subtract/execute |
| FeatureCollection.swapXYByQGIS | 使用QGIS交换XY坐标 | /openapi/algorithm/FeatureCollection/swapXYByQGIS/execute |
| FeatureCollection.taperedBufferByQGIS | 使用QGIS渐变缓冲 | /openapi/algorithm/FeatureCollection/taperedBufferByQGIS/execute |
| FeatureCollection.transectQGIS | 使用QGIS样线生成 | /openapi/algorithm/FeatureCollection/transectQGIS/execute |
| FeatureCollection.translatedFeaturesByQGIS | 使用QGIS要素平移 | /openapi/algorithm/FeatureCollection/translatedFeaturesByQGIS/execute |
| FeatureCollection.translateGeometryByQGIS | 使用QGIS几何平移 | /openapi/algorithm/FeatureCollection/translateGeometryByQGIS/execute |
| FeatureCollection.union | 合并两个矢量要素类中相交的几何 | /openapi/algorithm/FeatureCollection/union/execute |
| FeatureCollection.voronoi | 生成泰森多边形 | /openapi/algorithm/FeatureCollection/voronoi/execute |
| FeatureCollection.voronoiPolygonsByQGIS | 使用QGIS泰森多边形生成 | /openapi/algorithm/FeatureCollection/voronoiPolygonsByQGIS/execute |
| FeatureCollection.wedgeBuffersByQGIS | 使用QGIS楔形缓冲 | /openapi/algorithm/FeatureCollection/wedgeBuffersByQGIS/execute |

## Feature (46)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Feature.addStyles | 为矢量要素附加上图样式 | /openapi/algorithm/Feature/addStyles/execute |
| Feature.area | 计算矢量要素几何面积 | /openapi/algorithm/Feature/area/execute |
| Feature.bounds | 边界框计算 | /openapi/algorithm/Feature/bounds/execute |
| Feature.buffer | 缓冲区分析 | /openapi/algorithm/Feature/buffer/execute |
| Feature.centroid | 质心计算 | /openapi/algorithm/Feature/centroid/execute |
| Feature.closestPoint | 计算最近点 | /openapi/algorithm/Feature/closestPoint/execute |
| Feature.closestPoints | 计算最近点数组 | /openapi/algorithm/Feature/closestPoints/execute |
| Feature.containedIn | 几何被包含判断 | /openapi/algorithm/Feature/containedIn/execute |
| Feature.contains | 几何包含判断 | /openapi/algorithm/Feature/contains/execute |
| Feature.convexHull | 生成凸包 | /openapi/algorithm/Feature/convexHull/execute |
| Feature.copyProperties | 复制要素属性 | /openapi/algorithm/Feature/copyProperties/execute |
| Feature.createFromGeojson | 从GeoJSON构建矢量要素 | /openapi/algorithm/Feature/createFromGeojson/execute |
| Feature.createFromGeometry | 从几何体构建矢量要素 | /openapi/algorithm/Feature/createFromGeometry/execute |
| Feature.cutLines | 线段分割 | /openapi/algorithm/Feature/cutLines/execute |
| Feature.densify | 节点加密 | /openapi/algorithm/Feature/densify/execute |
| Feature.difference | 差集运算 | /openapi/algorithm/Feature/difference/execute |
| Feature.disjoint | 几何相离判断 | /openapi/algorithm/Feature/disjoint/execute |
| Feature.dissolve | 融合几何 | /openapi/algorithm/Feature/dissolve/execute |
| Feature.distance | 欧氏距离计算 | /openapi/algorithm/Feature/distance/execute |
| Feature.export | 导出矢量要素 | /openapi/algorithm/Feature/export/execute |
| Feature.geometry | 获取几何体 | /openapi/algorithm/Feature/geometry/execute |
| Feature.get | 获取属性值 | /openapi/algorithm/Feature/get/execute |
| Feature.getNumber | 获取数值类型的属性值 | /openapi/algorithm/Feature/getNumber/execute |
| Feature.getString | 获取字符串类型的属性值 | /openapi/algorithm/Feature/getString/execute |
| Feature.greatCircleDistance | 大圆距离计算 | /openapi/algorithm/Feature/greatCircleDistance/execute |
| Feature.id | 获取矢量要素ID | /openapi/algorithm/Feature/id/execute |
| Feature.intersection | 交集运算 | /openapi/algorithm/Feature/intersection/execute |
| Feature.intersects | 几何相交判断 | /openapi/algorithm/Feature/intersects/execute |
| Feature.length | 计算矢量要素几何长度 | /openapi/algorithm/Feature/length/execute |
| Feature.load | 根据几何元信息加载要素 | /openapi/algorithm/Feature/load/execute |
| Feature.loadFeatureFromUpload | 根据上传的 GeoJSON 文件构造要素 | /openapi/algorithm/Feature/loadFeatureFromUpload/execute |
| Feature.loadFromGeojson | 根据GeoJSON构造要素 | /openapi/algorithm/Feature/loadFromGeojson/execute |
| Feature.loadFromGeometry | 根据几何构造要素 | /openapi/algorithm/Feature/loadFromGeometry/execute |
| Feature.manhattanDistance | 曼哈顿距离计算 | /openapi/algorithm/Feature/manhattanDistance/execute |
| Feature.perimeter | 计算矢量要素几何周长 | /openapi/algorithm/Feature/perimeter/execute |
| Feature.propertyNames | 获取要素所有属性名 | /openapi/algorithm/Feature/propertyNames/execute |
| Feature.reproject | 矢量要素重投影 | /openapi/algorithm/Feature/reproject/execute |
| Feature.select | 选择属性映射为新属性名 | /openapi/algorithm/Feature/select/execute |
| Feature.set | 设置属性值 | /openapi/algorithm/Feature/set/execute |
| Feature.setGeometry | 设置几何体 | /openapi/algorithm/Feature/setGeometry/execute |
| Feature.simplify | 几何简化 | /openapi/algorithm/Feature/simplify/execute |
| Feature.symmetricDifference | 对称差运算 | /openapi/algorithm/Feature/symmetricDifference/execute |
| Feature.toArray | 将要素属性值转换为数组 | /openapi/algorithm/Feature/toArray/execute |
| Feature.toDictionary | 将要素转换为Map | /openapi/algorithm/Feature/toDictionary/execute |
| Feature.union | 几何联合 | /openapi/algorithm/Feature/union/execute |
| Feature.withinDistance | 判断几何是否在限定距离范围内 | /openapi/algorithm/Feature/withinDistance/execute |

## SpatialStats (43)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| SpatialStats.BasicStatistics.AverageNearestNeighbor | 平均最近邻分析 | /openapi/algorithm/SpatialStats/BasicStatistics/AverageNearestNeighbor/execute |
| SpatialStats.BasicStatistics.DescriptiveStatistics | 描述性统计分析 | /openapi/algorithm/SpatialStats/BasicStatistics/DescriptiveStatistics/execute |
| SpatialStats.BasicStatistics.KernelDensityEstimation | 核密度估计 | /openapi/algorithm/SpatialStats/BasicStatistics/KernelDensityEstimation/execute |
| SpatialStats.BasicStatistics.PrincipalComponentAnalysis | 主成分分析 | /openapi/algorithm/SpatialStats/BasicStatistics/PrincipalComponentAnalysis/execute |
| SpatialStats.BasicStatistics.RipleysK | Ripley’s K函数分析 | /openapi/algorithm/SpatialStats/BasicStatistics/RipleysK/execute |
| SpatialStats.GWModels.GTWR.autoFit | 时空地理加权回归自动拟合 | /openapi/algorithm/SpatialStats/GWModels/GTWR/autoFit/execute |
| SpatialStats.GWModels.GTWR.fit | 时空地理加权回归拟合 | /openapi/algorithm/SpatialStats/GWModels/GTWR/fit/execute |
| SpatialStats.GWModels.GWAverage | 地理加权平均 | /openapi/algorithm/SpatialStats/GWModels/GWAverage/execute |
| SpatialStats.GWModels.GWCorrelation | 地理加权相关 | /openapi/algorithm/SpatialStats/GWModels/GWCorrelation/execute |
| SpatialStats.GWModels.GWDA.calculate | 地理加权判别分析计算 | /openapi/algorithm/SpatialStats/GWModels/GWDA/calculate/execute |
| SpatialStats.GWModels.GWPCA | 地理加权主成分分析 | /openapi/algorithm/SpatialStats/GWModels/GWPCA/execute |
| SpatialStats.GWModels.GWRbasic.auto | 基础地理加权回归自动优化 | /openapi/algorithm/SpatialStats/GWModels/GWRbasic/auto/execute |
| SpatialStats.GWModels.GWRbasic.autoFit | 基础地理加权回归自动拟合 | /openapi/algorithm/SpatialStats/GWModels/GWRbasic/autoFit/execute |
| SpatialStats.GWModels.GWRbasic.fit | 基础地理加权回归拟合 | /openapi/algorithm/SpatialStats/GWModels/GWRbasic/fit/execute |
| SpatialStats.GWModels.GWRGeneralized.fit | 广义地理加权回归拟合 | /openapi/algorithm/SpatialStats/GWModels/GWRGeneralized/fit/execute |
| SpatialStats.SpatialHeterogeneity.GeoEcologicalDetector | 地理生态探测器 | /openapi/algorithm/SpatialStats/SpatialHeterogeneity/GeoEcologicalDetector/execute |
| SpatialStats.SpatialHeterogeneity.GeoFactorDetector | 地理因子探测器 | /openapi/algorithm/SpatialStats/SpatialHeterogeneity/GeoFactorDetector/execute |
| SpatialStats.SpatialHeterogeneity.GeoInteractionDetector | 地理交互探测器 | /openapi/algorithm/SpatialStats/SpatialHeterogeneity/GeoInteractionDetector/execute |
| SpatialStats.SpatialHeterogeneity.GeoRiskDetector | 地理风险探测器 | /openapi/algorithm/SpatialStats/SpatialHeterogeneity/GeoRiskDetector/execute |
| SpatialStats.SpatialInterpolation.IDW.fit | 反距离加权插值拟合 | /openapi/algorithm/SpatialStats/SpatialInterpolation/IDW/fit/execute |
| SpatialStats.SpatialInterpolation.LinearInterpolation.fit | 线性插值拟合 | /openapi/algorithm/SpatialStats/SpatialInterpolation/LinearInterpolation/fit/execute |
| SpatialStats.SpatialInterpolation.NearestNeighbourInterpolation.fit | 最近邻插值拟合 | /openapi/algorithm/SpatialStats/SpatialInterpolation/NearestNeighbourInterpolation/fit/execute |
| SpatialStats.SpatialInterpolation.OrdinaryKriging | 普通克里金插值 | /openapi/algorithm/SpatialStats/SpatialInterpolation/OrdinaryKriging/execute |
| SpatialStats.SpatialInterpolation.selfDefinedKriging | 自定义克里金插值 | /openapi/algorithm/SpatialStats/SpatialInterpolation/selfDefinedKriging/execute |
| SpatialStats.SpatialInterpolation.SplineInterpolation.BSpline | B样条插值 | /openapi/algorithm/SpatialStats/SpatialInterpolation/SplineInterpolation/BSpline/execute |
| SpatialStats.SpatialInterpolation.SplineInterpolation.thinPlateSpline | 薄板样条插值 | /openapi/algorithm/SpatialStats/SpatialInterpolation/SplineInterpolation/thinPlateSpline/execute |
| SpatialStats.SpatialRegression.LinearRegression.feature | 线性回归特征提取 | /openapi/algorithm/SpatialStats/SpatialRegression/LinearRegression/feature/execute |
| SpatialStats.SpatialRegression.LogisticRegression.feature | 逻辑回归特征提取 | /openapi/algorithm/SpatialStats/SpatialRegression/LogisticRegression/feature/execute |
| SpatialStats.SpatialRegression.PoissonRegression.feature | 泊松回归特征提取 | /openapi/algorithm/SpatialStats/SpatialRegression/PoissonRegression/feature/execute |
| SpatialStats.SpatialRegression.SpatialDurbinModel.fit | 空间杜宾模型拟合 | /openapi/algorithm/SpatialStats/SpatialRegression/SpatialDurbinModel/fit/execute |
| SpatialStats.SpatialRegression.SpatialErrorModel.fit | 空间误差模型拟合 | /openapi/algorithm/SpatialStats/SpatialRegression/SpatialErrorModel/fit/execute |
| SpatialStats.SpatialRegression.SpatialLagModel.fit | 空间滞后模型拟合 | /openapi/algorithm/SpatialStats/SpatialRegression/SpatialLagModel/fit/execute |
| SpatialStats.STCorrelations.CorrelationAnalysis.corrMat | 相关性矩阵计算 | /openapi/algorithm/SpatialStats/STCorrelations/CorrelationAnalysis/corrMat/execute |
| SpatialStats.STCorrelations.SpatialAutoCorrelation.getisOrdG | 计算Getis-Ord G指数 | /openapi/algorithm/SpatialStats/STCorrelations/SpatialAutoCorrelation/getisOrdG/execute |
| SpatialStats.STCorrelations.SpatialAutoCorrelation.globalGearyC | 计算全局吉尔里C系数 | /openapi/algorithm/SpatialStats/STCorrelations/SpatialAutoCorrelation/globalGearyC/execute |
| SpatialStats.STCorrelations.SpatialAutoCorrelation.globalMoranI | 计算全局莫兰指数 | /openapi/algorithm/SpatialStats/STCorrelations/SpatialAutoCorrelation/globalMoranI/execute |
| SpatialStats.STCorrelations.SpatialAutoCorrelation.localGearyC | 计算局部吉尔里C系数 | /openapi/algorithm/SpatialStats/STCorrelations/SpatialAutoCorrelation/localGearyC/execute |
| SpatialStats.STCorrelations.SpatialAutoCorrelation.localMoranI | 计算局部莫兰指数 | /openapi/algorithm/SpatialStats/STCorrelations/SpatialAutoCorrelation/localMoranI/execute |
| SpatialStats.STCorrelations.TemporalAutoCorrelation.ACF | 计算时间自相关函数 | /openapi/algorithm/SpatialStats/STCorrelations/TemporalAutoCorrelation/ACF/execute |
| SpatialStats.STSampling.randomSampling | 时空随机采样 | /openapi/algorithm/SpatialStats/STSampling/randomSampling/execute |
| SpatialStats.STSampling.regularSampling | 时空规则采样 | /openapi/algorithm/SpatialStats/STSampling/regularSampling/execute |
| SpatialStats.STSampling.SandwichSampling | 三明治采样 | /openapi/algorithm/SpatialStats/STSampling/SandwichSampling/execute |
| SpatialStats.STSampling.stratifiedSampling | 分层采样 | /openapi/algorithm/SpatialStats/STSampling/stratifiedSampling/execute |

## Filter (30)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Filter.And | 构建与逻辑连接 | /openapi/algorithm/Filter/And/execute |
| Filter.bounds | 构建几何边界框过滤条件 | /openapi/algorithm/Filter/bounds/execute |
| Filter.codeConsistency | 构建代码一致性过滤条件 | /openapi/algorithm/Filter/codeConsistency/execute |
| Filter.contains | 构建几何包含过滤条件 | /openapi/algorithm/Filter/contains/execute |
| Filter.covers | 构建几何覆盖过滤条件 | /openapi/algorithm/Filter/covers/execute |
| Filter.crosses | 构建几何交叉过滤条件 | /openapi/algorithm/Filter/crosses/execute |
| Filter.dateRange | 构建日期区间过滤条件 | /openapi/algorithm/Filter/dateRange/execute |
| Filter.disjoint | 构建几何相离过滤条件 | /openapi/algorithm/Filter/disjoint/execute |
| Filter.eq | 构建相等过滤条件 | /openapi/algorithm/Filter/eq/execute |
| Filter.equals | 构建等于过滤条件(支持字段比较) | /openapi/algorithm/Filter/equals/execute |
| Filter.expression | SQL表达式转换为条件过滤对象 | /openapi/algorithm/Filter/expression/execute |
| Filter.geoEquals | 构建几何相等过滤条件 | /openapi/algorithm/Filter/geoEquals/execute |
| Filter.greaterThan | 构建大于过滤条件(支持字段比较) | /openapi/algorithm/Filter/greaterThan/execute |
| Filter.greaterThanOrEquals | 构建大于等于过滤条件(支持字段比较) | /openapi/algorithm/Filter/greaterThanOrEquals/execute |
| Filter.inList | 构建值在列表中滤条件 | /openapi/algorithm/Filter/inList/execute |
| Filter.intersects | 构建几何相交过滤条件 | /openapi/algorithm/Filter/intersects/execute |
| Filter.isContained | 构建几何被包含过滤条件 | /openapi/algorithm/Filter/isContained/execute |
| Filter.lessThanOrEquals | 构建小于等于过滤条件(支持字段比较) | /openapi/algorithm/Filter/lessThanOrEquals/execute |
| Filter.listContains | 构建列表包含值过滤条件 | /openapi/algorithm/Filter/listContains/execute |
| Filter.lte | 构建小于等于过滤条件 | /openapi/algorithm/Filter/lte/execute |
| Filter.neq | 构建不等过滤条件 | /openapi/algorithm/Filter/neq/execute |
| Filter.Not | 构建非逻辑过滤条件 | /openapi/algorithm/Filter/Not/execute |
| Filter.notEquals | 构建不等于过滤条件(支持字段比较) | /openapi/algorithm/Filter/notEquals/execute |
| Filter.notNull | 构建非空过滤条件 | /openapi/algorithm/Filter/notNull/execute |
| Filter.Or | 构建或逻辑连接 | /openapi/algorithm/Filter/Or/execute |
| Filter.rangeContain | 构建数值区间过滤条件 | /openapi/algorithm/Filter/rangeContain/execute |
| Filter.stringStartsWith | 构建字符串前缀匹配过滤条件 | /openapi/algorithm/Filter/stringStartsWith/execute |
| Filter.toExpression | 条件过滤对象转换为SQL表达式 | /openapi/algorithm/Filter/toExpression/execute |
| Filter.touches | 构建几何接触过滤条件 | /openapi/algorithm/Filter/touches/execute |
| Filter.within | 构建几何在内部过滤条件 | /openapi/algorithm/Filter/within/execute |

## (no package) (23)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| HY_AquaculturePond | 养殖坑塘识别 | /openapi/algorithm/HY_AquaculturePond/execute |
| HY_BuildingChange | 建筑变化检测 | /openapi/algorithm/HY_BuildingChange/execute |
| HY_BuildingDetection | 建筑识别 | /openapi/algorithm/HY_BuildingDetection/execute |
| HY_ChangeDetection | 变化检测 | /openapi/algorithm/HY_ChangeDetection/execute |
| HY_Cropland | 耕地识别 | /openapi/algorithm/HY_Cropland/execute |
| HY_Greenhouse | 温室大棚识别 | /openapi/algorithm/HY_Greenhouse/execute |
| HY_Mariculture | 海上养殖区识别 | /openapi/algorithm/HY_Mariculture/execute |
| HY_PhotovoltaicPanel | 光伏面板识别 | /openapi/algorithm/HY_PhotovoltaicPanel/execute |
| HY_ShipDetection | 船只检测 | /openapi/algorithm/HY_ShipDetection/execute |
| HY_WindTurbDetection | 海上风机识别 | /openapi/algorithm/HY_WindTurbDetection/execute |
| ogeai/songxc/de | 松线虫疫木识别 | /openapi/algorithm/ogeai/songxc/de/execute |
| ogeai/uav_pv/seg | 屋顶光伏提取 | /openapi/algorithm/ogeai/uav_pv/seg/execute |
| tdt_building_seg | 天地图建筑提取模型 | /openapi/algorithm/tdt_building_seg/execute |
| tdt_farm_seg | 天地图耕地提取模型 | /openapi/algorithm/tdt_farm_seg/execute |
| tdt_water_seg | 天地图水体提取模型 | /openapi/algorithm/tdt_water_seg/execute |
| whu-cultivated_land | 耕地提取 | /openapi/algorithm/whu-cultivated_land/execute |
| whu-greenhouse | 大棚提取 | /openapi/algorithm/whu-greenhouse/execute |
| whu-mainroad | 主干道提取 | /openapi/algorithm/whu-mainroad/execute |
| whu-playground | 操场检测 | /openapi/algorithm/whu-playground/execute |
| whu-ship | 船舶检测 | /openapi/algorithm/whu-ship/execute |
| whu01_buildtop | 屋顶提取 | /openapi/algorithm/whu01_buildtop/execute |
| whu01_plane | 飞机检测 | /openapi/algorithm/whu01_plane/execute |
| whu01_water | 水体提取 | /openapi/algorithm/whu01_water/execute |

## Kernel (21)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Kernel.add | 核加法运算 | /openapi/algorithm/Kernel/add/execute |
| Kernel.chebyshev | 构建切比雪夫距离核 | /openapi/algorithm/Kernel/chebyshev/execute |
| Kernel.circle | 构建圆形核 | /openapi/algorithm/Kernel/circle/execute |
| Kernel.compass | 构建罗盘算子核 | /openapi/algorithm/Kernel/compass/execute |
| Kernel.diamond | 构建菱形核 | /openapi/algorithm/Kernel/diamond/execute |
| Kernel.euclidean | 构建欧氏距离核 | /openapi/algorithm/Kernel/euclidean/execute |
| Kernel.fixed | 构建固定权重核 | /openapi/algorithm/Kernel/fixed/execute |
| Kernel.gaussian | 构建高斯核 | /openapi/algorithm/Kernel/gaussian/execute |
| Kernel.inverse | 构建逆距离核 | /openapi/algorithm/Kernel/inverse/execute |
| Kernel.kirsch | 构建Kirsch算子核 | /openapi/algorithm/Kernel/kirsch/execute |
| Kernel.laplacian4 | 构建四方向拉普拉斯核 | /openapi/algorithm/Kernel/laplacian4/execute |
| Kernel.laplacian8 | 构建八方向拉普拉斯核 | /openapi/algorithm/Kernel/laplacian8/execute |
| Kernel.manhattan | 构建曼哈顿距离核 | /openapi/algorithm/Kernel/manhattan/execute |
| Kernel.octagon | 构建八角形核 | /openapi/algorithm/Kernel/octagon/execute |
| Kernel.plus | 构建十字形核 | /openapi/algorithm/Kernel/plus/execute |
| Kernel.prewitt | 构建Prewitt算子核 | /openapi/algorithm/Kernel/prewitt/execute |
| Kernel.rectangle | 构建矩形核 | /openapi/algorithm/Kernel/rectangle/execute |
| Kernel.roberts | 构建Roberts算子核 | /openapi/algorithm/Kernel/roberts/execute |
| Kernel.rotate | 核旋转运算 | /openapi/algorithm/Kernel/rotate/execute |
| Kernel.sobel | 构建Sobel算子核 | /openapi/algorithm/Kernel/sobel/execute |
| Kernel.square | 构建正方形核 | /openapi/algorithm/Kernel/square/execute |

## Service (15)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Service.exportToServer | Service.exportToServer | /openapi/algorithm/Service/exportToServer/execute |
| Service.getCoverage | 获取单景栅格数据 | /openapi/algorithm/Service/getCoverage/execute |
| Service.getCoverageArray | 获取单景栅格数据数组 | /openapi/algorithm/Service/getCoverageArray/execute |
| Service.getCoverageByFeature | 按范围获取栅格数据 | /openapi/algorithm/Service/getCoverageByFeature/execute |
| Service.getCoverageCollection | 获取单景栅格数据集合 | /openapi/algorithm/Service/getCoverageCollection/execute |
| Service.getFeature | 获取矢量要素 | /openapi/algorithm/Service/getFeature/execute |
| Service.getFeatureCollection | 获取矢量要素类 | /openapi/algorithm/Service/getFeatureCollection/execute |
| Service.getModel | 获取机器学习模型 | /openapi/algorithm/Service/getModel/execute |
| Service.getOnlineCoverage | 获取在线底图栅格数据 | /openapi/algorithm/Service/getOnlineCoverage/execute |
| Service.getProcess | 获取算法 | /openapi/algorithm/Service/getProcess/execute |
| Service.loadFileToLocal | Service.loadFileToLocal | /openapi/algorithm/Service/loadFileToLocal/execute |
| Service.printList | 打印列表 | /openapi/algorithm/Service/printList/execute |
| Service.printNumber | 打印数值 | /openapi/algorithm/Service/printNumber/execute |
| Service.printSheet | 打印工作表 | /openapi/algorithm/Service/printSheet/execute |
| Service.printString | 打印文本 | /openapi/algorithm/Service/printString/execute |

## CoverageCollection (13)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| CoverageCollection.addStyles | 为单栅格数据集合附加上图样式 | /openapi/algorithm/CoverageCollection/addStyles/execute |
| CoverageCollection.and | 单景栅格数据集合逻辑与 | /openapi/algorithm/CoverageCollection/and/execute |
| CoverageCollection.export | 导出单景栅格数据集合 | /openapi/algorithm/CoverageCollection/export/execute |
| CoverageCollection.map | 在覆盖集合中迭代调用自定义脚本 | /openapi/algorithm/CoverageCollection/map/execute |
| CoverageCollection.max | 单景栅格集合最大值 | /openapi/algorithm/CoverageCollection/max/execute |
| CoverageCollection.mean | 单景栅格集合均值 | /openapi/algorithm/CoverageCollection/mean/execute |
| CoverageCollection.median | 单景栅格集合中位数 | /openapi/algorithm/CoverageCollection/median/execute |
| CoverageCollection.mergeCoverages | 合并单景栅格集合 | /openapi/algorithm/CoverageCollection/mergeCoverages/execute |
| CoverageCollection.min | 单景栅格集合最小值 | /openapi/algorithm/CoverageCollection/min/execute |
| CoverageCollection.mode | 单景栅格数据集合众数计算 | /openapi/algorithm/CoverageCollection/mode/execute |
| CoverageCollection.mosaic | 镶嵌拼接 | /openapi/algorithm/CoverageCollection/mosaic/execute |
| CoverageCollection.or | 单景栅格数据集合逻辑或 | /openapi/algorithm/CoverageCollection/or/execute |
| CoverageCollection.sum | 单景栅格集合求和 | /openapi/algorithm/CoverageCollection/sum/execute |

## Geometry (10)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Geometry.addStyles | 为几何体附加上图样式 | /openapi/algorithm/Geometry/addStyles/execute |
| Geometry.GeometryCollection | 构建几何体集合 | /openapi/algorithm/Geometry/GeometryCollection/execute |
| Geometry.LinearRing | 构建线环几何体 | /openapi/algorithm/Geometry/LinearRing/execute |
| Geometry.LineString | 构建线几何体 | /openapi/algorithm/Geometry/LineString/execute |
| Geometry.MultiLineString | 构建多线几何体 | /openapi/algorithm/Geometry/MultiLineString/execute |
| Geometry.MultiPoint | 构建多点几何体 | /openapi/algorithm/Geometry/MultiPoint/execute |
| Geometry.MultiPolygon | 构建多面几何体 | /openapi/algorithm/Geometry/MultiPolygon/execute |
| Geometry.Point | 构建点几何体 | /openapi/algorithm/Geometry/Point/execute |
| Geometry.Polygon | 构建面几何体 | /openapi/algorithm/Geometry/Polygon/execute |
| Geometry.reproject | 几何体重投影 | /openapi/algorithm/Geometry/reproject/execute |

## sd (4)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| sd.maskcd | 通用变化检测模型模型 | /openapi/algorithm/sd/maskcd/execute |
| sd.uav_obejct_detction | 无人机目标识别模型 | /openapi/algorithm/sd/uav_obejct_detction/execute |
| sd.uavluccseg | 无人机影像土地利用分类模型 | /openapi/algorithm/sd/uavluccseg/execute |
| sd.wheat_maize | 多时相小麦玉米提取模型 | /openapi/algorithm/sd/wheat_maize/execute |

## 2026081502 (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| 2026081502.2026081502 | 桉树倒伏区域监测 | /openapi/algorithm/2026081502/2026081502/execute |

## 2026081601 (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| 2026081601.2026081601 | 桉树幼苗存活识别与统计 | /openapi/algorithm/2026081601/2026081601/execute |

## Collection (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| Collection.map | 在集合中迭代调用自定义脚本 | /openapi/algorithm/Collection/map/execute |

## ComputedObject (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| ComputedObject.getbbox | 计算输入对象的四至坐标 | /openapi/algorithm/ComputedObject/getbbox/execute |

## CoverageArray (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| CoverageArray.export | 导出单景栅格数据数组 | /openapi/algorithm/CoverageArray/export/execute |

## gn (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| gn.liefeng | 地裂缝检测 | /openapi/algorithm/gn/liefeng/execute |

## MLmodel (1)

| 算子 | 别名 | OpenAPI 路径 |
|---|---|---|
| MLmodel.export | 导出机器学习模型 | /openapi/algorithm/MLmodel/export/execute |
