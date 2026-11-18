# 双期案例资料

各案例均采用 Sentinel-2 L2A，输入为 EPSG:32649 的同原点、同覆盖范围网格，光学和关注点为 10 米，SWIR 与 SCL 为 20 米。案例资料用于识别平台检索返回的资产。调用使用账号实际可访问的资产名称与扩展名。

| 区域 | OGE 个人数据检索词 | 前期 | 后期 | 观测用途 |
| --- | --- | --- | --- | --- |
| 广西贵港郁江 | yujiang | 2026-06-22 | 2026-07-12 | 河道及沿岸水面变化与退水期研判 |
| 广东英德北江大站镇附近 | yingde | 2022-05-04 | 2022-06-23 | 对比大站镇附近北江河段的五月、六月水面变化 |
| 贵州黔东南榕江都柳江 | duliujiang8k | 2025-05-01 | 2025-07-18 | 洪水前背景与灾后水面，区分可复核变化和云影缺口 |

郁江的六份影像名为 `guigang_{YYYYMMDD}_{数据组}_yujiang_v1.tif`。配套关注点为 `guigang_yujiang_poi10m_v1.tif`，ID 上限 30。榕江的六份影像名为 `rongjiang_{YYYYMMDD}_{数据组}_duliujiang8k.tif`。配套关注点为 `rongjiang_poi10m_duliujiang8k.tif`，ID 上限 3。榕江使用都柳江交汇附近 8 km × 8 km 原生对齐窗口。

英德的六份影像名为 `yingde_beijiang_{YYYYMMDD}_{数据组}.tif`。配套关注点为 `yingde_beijiang_poi10m.tif`，已验证的服务调用使用 `poiMaxId: 65535`。成果外包范围约为 113.383–113.485°E、24.126–24.220°N，实际统计范围以栅格掩膜为准。

数据组为 `optical10m`、`swir20m`、`scl20m`。资产路径为 `myData/{完整文件名}`。将前期三份资产分别传给 `beforeCoverageID`、`beforeSwirPath`、`beforeSclPath`，将后期传给 `coverageID`、`swirPath`、`sclPath`，并使用本案例的 `poiRasterPath` 和 `poiMaxId`。各案例调用都显式传入这七个路径和编号上限。导出名称可用能区分案例与阈值版本的英文名称。

2025 年 6 月 24 日和 28 日榕江有两次洪峰。5 月 1 日是洪水前背景，7 月 18 日是灾后观测。选景用研究窗口内的场景分类覆盖预筛，正式判断以 OGE 的共同有效和比较掩膜为准。保留成片有效河谷与仍受遮挡的区域；根据本次影像标注应复核的候选变化及需要补观测的位置。两期影像有季节和水位差异，不能用来圈定两次洪峰的全部淹没范围。[贵州榕江洪水过程分析](https://epjournal.csee.org.cn/zh/article/doi/10.3969/j.issn.1001-9235.2026.01.008/)
