# 应用开发

# 1. 快速开始

## 1.1 环境初始化

导入oge模块

```python
import oge

```

使用oge.Service.initialize()进行初始化

```python
oge.initialize()
service = oge.Service.initialize()

```

## 1.2 数据读入

对于矢量数据，使用Feature.load算子进行读入

```python
import oge
# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.load").execute("China_MainRailway_Vector","null","EPSG:3857")

```

对于单一特定覆盖数据，使用oge.Service.getCoverage()进行读入

```python
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")

```

对于一定空间范围，一定时间，符合云量筛选条件的覆盖数据集合，使用oge.Service.getCoverageCollection()进行读入

```python
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])

```

## 1.3 矢量数据处理与分析

对于矢量数据的处理与分析，主要依赖oge中矢量处理算子进行实现

常用的语法如下：

```python
service.getProcess(processId).execute(args)

```

其中processId为对应的算子，args为算子所需要的参数，以构造点要素为例

```python
feature = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")

```

所有的矢量算子如下（整理的矢量处理算子）：

## 1.4 空间数据处理与分析

对于空间数据的处理与分析，主要依赖oge中栅格处理算子进行实现

常用的语法如下：

```python
service.getProcess(processId).execute(args)

```

其中processId为对应的算子，args为算子所需要的参数，以加法为例

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

a = service.getProcess("Coverage.add").execute(b3, b2)

```

所有的栅格处理算子如下（整理的栅格处理算子）：

## 1.5 数据可视化

在处理完数据后，oge提供了多种数据可视化的方式

### 1.5.1 添加数据样式

首先需要对数据添加样式

#### 矢量数据和矢量数据集合

使用Feature.styles(color, attribute)或FeatureCollection.styles(color, attribute)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>color</td> <td>颜色（形式为[""]，其中""为颜色的十六进制代码，如黑色为"#000000"）</td> <td>Array</td> </tr> <tr> <td>attribute</td> <td>属性名（默认为空）</td> <td>String</td> </tr> </tbody> </table>

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])

feature3.styles(["#000000"]).getMap("polygon3")
oge.mapclient.centerMap(37,12,5)

```

#### 覆盖数据和覆盖数据集合

Coverage.styles(vis_Params)或CoverageCollection.styles(vis_Params)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>vis_Params</td> <td>样式</td> <td>args</td> </tr> </tbody> </table>

其中vis_Params由如下项组成，可以缺省部分值

<table> <thead> <tr> <th>名称</th> <th>参数类型</th> <th>说明</th> </tr> </thead> <tbody> <tr> <td>bands</td> <td>List&lt;string&gt;</td> <td>要映射到 RGB 的三个波段名称的逗号分隔列表</td> </tr> <tr> <td>min</td> <td>Object</td> <td>映射到0的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>max</td> <td>Object</td> <td>映射到255的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gain</td> <td>Object</td> <td>与每个像素值相乘的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>bias</td> <td>Object</td> <td>每个Dn值都相加的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gamma</td> <td>Object</td> <td>Gamma校正系数,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>palette</td> <td>List&lt;string&gt;</td> <td>CSS 样式颜色字符串列表（仅限单波段图像）,逗号分隔的十六进制字符串列表</td> </tr> <tr> <td>opacity</td> <td>Float</td> <td>图层的不透明度(0.0 为完全透明, 1.0 为完全不透明)</td> </tr> <tr> <td>format</td> <td>String</td> <td>数据输出格式,是jpg还是png</td> </tr> </tbody> </table>

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).getMap("aspect")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

### 1.5.2 在线显示

在添加了数据样式后，可以选择在线显示，这时需要调用以上数据的getMap(layerName)方法

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

对于在线显示，通常最后会指定地图中心，这时需要调用oge.mapclient.centerMap(lon, lat, level)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>lon</td> <td>经度</td> <td>Double</td> </tr> <tr> <td>lat</td> <td>纬度</td> <td>Double</td> </tr> <tr> <td>level</td> <td>地图层级</td> <td>Int</td> </tr> </tbody> </table>

### 1.5.3 批处理

或者添加到批处理任务后，使用export(layerName)方法，添加到批处理任务后，在我的项目/批处理结果中下载处理后的图像

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).export("aspect")

```

# 2. API介绍

## 2.1 概览

oge提供了一个集海量地理空间数据、交互式编程分析、实时分布式计算和数据可视化为一体的在线时空数据分析云平台。通过Python脚本语言，可以调用海量数据和计算资源进行大规模地理数据实时计算分析。

通过oge API能够实现环境初始化、读取云端数据、矢量（空间）数据处理与分析、数据可视化等地理实时计算分析。

oge API的功能已按功能相关性分成不同的类别。了解其类别有助于确定要使用哪种特定函数。本部分结尾处的表列出了所有可用的类别，并描述了每个类别中函数所提供的功能。

<table> <thead> <tr> <th>类</th> <th>说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage提供了对于栅格数据的处理</td> </tr> <tr> <td>CoverageCollection</td> <td>CoverageCollection可用于对栅格数据集合的处理</td> </tr> <tr> <td>Feature</td> <td>Feature可用于对矢量数据的处理</td> </tr> <tr> <td>FeatureCollection</td> <td>FeatureCollection提供了对矢量集合的处理</td> </tr> <tr> <td>Process</td> <td>Process用于追加不同的处理方式</td> </tr> <tr> <td>Service</td> <td>Sevice用于初始化服务、获取云端数据、提交处理任务</td> </tr> <tr> <td>List</td> <td>List提供对列表的操作</td> </tr> <tr> <td>String</td> <td>String提供对字符串的操作</td> </tr> <tr> <td>Number</td> <td>Number提供对数值类型的操作</td> </tr> <tr> <td>Table</td> <td>Table提供对表的操作</td> </tr> </tbody> </table>

## 2.2 API介绍

### Coverage

#### Coverage.styles(vis_Params)

##### 描述

为Coverage添加样式

##### 语法

Coverage.styles(vis_Params)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>vis_Params</td> <td>样式</td> <td>args</td> </tr> </tbody> </table>

其中vis_Params由如下项组成，可以缺省部分值

<table> <thead> <tr> <th>名称</th> <th>参数类型</th> <th>说明</th> </tr> </thead> <tbody> <tr> <td>bands</td> <td>List&lt;string&gt;</td> <td>要映射到 RGB 的三个波段名称的逗号分隔列表</td> </tr> <tr> <td>min</td> <td>Object</td> <td>映射到0的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>max</td> <td>Object</td> <td>映射到255的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gain</td> <td>Object</td> <td>与每个像素值相乘的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>bias</td> <td>Object</td> <td>每个Dn值都相加的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gamma</td> <td>Object</td> <td>Gamma校正系数,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>palette</td> <td>List&lt;string&gt;</td> <td>CSS 样式颜色字符串列表（仅限单波段图像）,逗号分隔的十六进制字符串列表</td> </tr> <tr> <td>opacity</td> <td>Float</td> <td>图层的不透明度(0.0 为完全透明, 1.0 为完全不透明)</td> </tr> <tr> <td>format</td> <td>String</td> <td>数据输出格式,是jpg还是png</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).getMap("aspect")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### Coverage.getMap(layerName)

##### 描述

将Coverage渲染成地图

##### 语法

Coverage.getMap(layerName)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).getMap("aspect")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### Covergae.export(layerName)

##### 描述

提交批处理任务

##### 语法

Coverage.export(layerName)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).export("aspect")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

### CoverageCollection

#### CoverageCollection.styles(vis_Params)

##### 描述

为CoverageCollection添加样式

##### 语法

CoverageCollection.styles(vis_Params)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>vis_Params</td> <td>样式</td> <td>args</td> </tr> </tbody> </table>

其中vis_Params由如下项组成，可以缺省部分值

<table> <thead> <tr> <th>名称</th> <th>参数类型</th> <th>说明</th> </tr> </thead> <tbody> <tr> <td>bands</td> <td>List&lt;string&gt;</td> <td>要映射到 RGB 的三个波段名称的逗号分隔列表</td> </tr> <tr> <td>min</td> <td>Object</td> <td>映射到0的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>max</td> <td>Object</td> <td>映射到255的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gain</td> <td>Object</td> <td>与每个像素值相乘的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>bias</td> <td>Object</td> <td>每个Dn值都相加的值,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>gamma</td> <td>Object</td> <td>Gamma校正系数,单个值或三个值的列表，每个波段一个</td> </tr> <tr> <td>palette</td> <td>List&lt;string&gt;</td> <td>CSS 样式颜色字符串列表（仅限单波段图像）,逗号分隔的十六进制字符串列表</td> </tr> <tr> <td>opacity</td> <td>Float</td> <td>图层的不透明度(0.0 为完全透明, 1.0 为完全不透明)</td> </tr> <tr> <td>format</td> <td>String</td> <td>数据输出格式,是jpg还是png</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])
dem = service.getProcess("CoverageCollection.mosaic").execute(dem)
# dem = service.getProcess("Coverage.terrHillshade").execute(dem, 1,1)

# 设置渲染模式
vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中⼼位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

#### CoverageCollection.getMap(layerName)

##### 描述

将CoverageCollection渲染成地图

##### 语法

CoverageCollection.getMap(layerName)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])
dem = service.getProcess("CoverageCollection.mosaic").execute(dem)

# 设置渲染模式
vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中⼼位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

### Feature

#### Feature.styles(color, attribute)

##### 描述

为Feature添加样式和属性名

##### 语法

Feature.styles(color, attribute)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>color</td> <td>颜色（形式为[""]，其中""为颜色的十六进制代码，如黑色为"#000000"）</td> <td>Array</td> </tr> <tr> <td>attribute</td> <td>属性名（默认为空）</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])

feature3.styles(["#000000"]).getMap("polygon3")
oge.mapclient.centerMap(37,12,5)

```

#### Feature.getMap(layerName)

##### 描述

将Feature渲染成地图

##### 语法

Feature.getMap(layerName)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])

feature3.styles(["#000000"]).getMap("polygon3")
oge.mapclient.centerMap(37,12,5)

```

### FeatureCollection

#### FeatureCollection.styles(color, attribute)

##### 描述

为FeatureCollection添加样式和属性名

##### 语法

FeatureCollection.styles(color, attribute)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>color</td> <td>颜色（形式为[""]，其中""为颜色的十六进制代码，如黑色为"#000000"）</td> <td>Array</td> </tr> <tr> <td>attribute</td> <td>属性名（默认为空）</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])

feature3.styles(["#000000"]).getMap("polygon3")
oge.mapclient.centerMap(37,12,5)

```

#### FeatureCollection.getMap(layerName)

##### 描述

将FeatureCollection渲染成地图

##### 语法

FeatureCollection.getMap(layerName)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>layerName</td> <td>图层名字</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

null

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 可视化
feature.styles(["#FF0000"]).getMap("line")
oge.mapclient.centerMap(115.11,30.66,8)

```

### Process

#### Process.execute(args)

##### 描述

执行某一处理

##### 语法

通常直接对于Service中的getProcess进行操作

Service.getProcess(processId).execute(args)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>args</td> <td>特定处理输入的参数，具体参数参考算子描述</td> <td>Object</td> </tr> </tbody> </table>

##### 返回值

<table> <thead> <tr> <th>名称</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>object</td> <td>添加了参数的处理任务</td> <td>Object</td> </tr> </tbody> </table>

##### 代码示例

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 读取数据
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 选取波段
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

# 调用函数处理数据
a = service.getProcess("Coverage.subtract").execute(b3, b2)
# 设置渲染模式，其中"min":-100代表将-100映射到png图像的0，max": 100代表将100映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {}

a.styles(vis_params).getMap("res")
# 设置可视化地图中心和显示层级
oge.mapclient.centerMap(114.30, 30.608, 8)

```

### Sevice

#### Service.initialize()

##### 描述

初始化服务

##### 语法

Service.initialize()

##### 返回值

<table> <thead> <tr> <th>名称</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>service</td> <td>初始化的Service实例</td> <td>Service</td> </tr> </tbody> </table>

##### 代码示例

```python
service = oge.Service.initialize()

```

#### Service.getCoverageCollection(productID, dateTime, bbox, cloudCoverMin, cloudCoverMax)

##### 描述

检索一定空间范围，一定时间，符合云量筛选条件的覆盖数据集合

##### 语法

service.getCoverageCollection(collectionId, coverageId)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>productID</td> <td>产品ID</td> <td>String</td> </tr> <tr> <td>dataTime</td> <td>指定的时间范围</td> <td>List&lt;string&gt;</td> </tr> <tr> <td>bbox</td> <td>指定的空间范围</td> <td>List&lt;float&gt;</td> </tr> <tr> <td>cloudCoverMin</td> <td>最小云量（可不指定）</td> <td>Float</td> </tr> <tr> <td>cloudCoverMax</td> <td>最大云量（可不指定）</td> <td>Float</td> </tr> </tbody> </table>

##### 返回值

<table> <thead> <tr> <th>名称</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>coverageCollection</td> <td>特定的覆盖数据</td> <td>CoverageCollection</td> </tr> </tbody> </table>

##### 代码示例

```python
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])

```

#### Service.getCoverage(collectionId, coverageId)

##### 描述

检索特定Id的覆盖数据

##### 语法

service.getCoverage(collectionId, coverageId)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>coverageID</td> <td>覆盖数据ID</td> <td>String</td> </tr> <tr> <td>productID</td> <td>产品ID</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

<table> <thead> <tr> <th>名称</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>特定的覆盖数据</td> <td>Coverage</td> </tr> </tbody> </table>

##### 代码示例

```python
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")

```

#### Service.getProcess(processId)

##### 描述

提交处理任务

##### 语法

Service.getProcess(processId)

<table> <thead> <tr> <th>参数</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>processId</td> <td>处理的Id即算子名称</td> <td>String</td> </tr> </tbody> </table>

##### 返回值

<table> <thead> <tr> <th>名称</th> <th>说明</th> <th>数据类型</th> </tr> </thead> <tbody> <tr> <td>process</td> <td>完成的处理任务</td> <td>process实例</td> </tr> </tbody> </table>

##### 代码示例

```python
a = service.getProcess("Coverage.add").execute(b3, b2)

```

### List

#### List.log(name)

##### 描述

打印名为name的List

##### 语法

List.log("a")

### String

#### String.log(name)

##### 描述

打印名为name的String

##### 语法

String.log("a")

### Number

#### Number.log(name)

##### 描述

打印名为name的Number

##### 语法

Number.log("a")

### Table.log(name)

##### 描述

打印名为name的Table

##### 语法

Table.log("a")

# 3. 算子介绍

## 3.1 栅格处理

### 3.1.1 数据工具

#### 创建经纬度栅格

##### Coverage.latlongByGrass

###### 描述

Creates a latitude/longitude raster map.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Creates a latitude/longitude raster map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service.initialize()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
lBG= service.getProcess(
    "Coverage.latlongByGrass").execute(b3)
vis_params = { "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
lBG.styles(vis_params).getMap("lBG")
oge.mapclient.centerMap(114.30, 30.608, 10)            

```

#### 数据信息

##### Coverage.bandTypes

###### 描述

返回覆盖数据包含的波段的数据类型

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Map</td> <td>Map</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
bandTypes = service.getProcess("Coverage.bandTypes").execute(ls8)
bandTypes.log("bandTypes")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

##### Coverage.date

###### 描述

Return the acquisition date of the given coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The Coverage as the input data.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Return the acquisition date of the given coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
n = service.getProcess("Coverage.date").execute(ls8)
n.log("date")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

##### Coverage.metadata

###### 描述

Return the metadata of the input coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The image to get the metadata</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Return the metadata of the input coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
metadata = service.getProcess("Coverage.metadata").execute(ls8)
metadata.log("metadata")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

##### Coverage.projection

###### 描述

oturns the projection of an Image.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to get the projection.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Returns the projection of an Image.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
crs = service.getProcess("Coverage.projection").execute(ls8)
crs.log("crs")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

#### 数据处理

##### Coverage.rename

###### 描述

为波段重新命名(list为新名称，长度与波段数一致)

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>name</td> <td>List&lt;string&gt;</td> <td>The new names for the bands. Must match the number of bands in the Coverage.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
ls8 = service.getProcess("Coverage.rename").execute(ls8,["A1","A2","A3","A4","A5","A6","A7","A8","A9"])
bandNames = service.getProcess("Coverage.bandNames").execute(ls8)
bandNames.log("bandNames")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

##### Coverage.patchByGrass

###### 描述

Creates a composite raster map layer by using known category values from one(or more) map layer(s) to fill in areas of 'no data' in another map layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>CoverageCollection</td> <td>Name of raster maps to be patched together</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Creates a composite raster map layer by using known category values from one(or more) map layer(s) to fill in areas of 'no data' in another map layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])
dem = service.getProcess("Coverage.patchByGrass").execute(dem)

# 设置渲染模式
vis_params = {"palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中?位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

##### Coverage.fillNodataByGDAL

###### 描述

Fill raster regions with no data values by interpolation from edges.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster layer.</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>The number of pixels to search in all directions to find values to interpolate from.</td> </tr> <tr> <td>iterations</td> <td>Double</td> <td>The number of 3x3 filter passes to run (0 or more) to smoothen the results of the interpolation.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>maskLayer</td> <td>String</td> <td>A raster layer that defines the areas to fill.</td> </tr> <tr> <td>noMask</td> <td>String</td> <td>Activates the user-defined validity mask.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>The band to operate on. Nodata values must be represented by the value 0.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Fill raster regions with no data values by interpolation from edges.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.fillNodataByGDAL").execute(
    dem, 10, 0, "", "", "False", 1, "")
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.addNum

###### 描述

Add the value to the coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value to add.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Add the value to the coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

b3 = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

a = service.getProcess(
    "Coverage.addNum").execute(b3, 1)

vis_params = {'min': -100, 'max': 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.mod

###### 描述

Mods the first value to the second for each matched pair of bands in image1 and image2. If either image1 or image2 has only 1 band, then it is used against all the bands in the other image. If the images have the same number of bands, but not the same names, they're used pairwise in the natural order. The output bands are named for the longer of the two inputs, or if they're equal in length, in image1's order. The type of the output pixels is the union of the input types. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The image from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The image from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Mods the first value to the second for each matched pair of bands in image1 and image2. If either image1 or image2 has only 1 band, then it is used against all the bands in the other image. If the images have the same number of bands, but not the same names, they're used pairwise in the natural order. The output bands are named for the longer of the two inputs, or if they're equal in length, in image1's order. The type of the output pixels is the union of the input types.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
mod = service.getProcess("Coverage.mod").execute(b3, b2)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
mod.styles(vis_params).getMap("mod")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.modNum

###### 描述

Mods the coverage to the value.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value for pow.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Mods the coverage to the value.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

# 调用函数处理数据
a = service.getProcess(
"Coverage.modNum").execute(b3, 2.0)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.nearBlackByGDAL

###### 描述

Converts nearly black/white borders to black.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>white</td> <td>String</td> <td>Search for nearly white (255) pixels instead of nearly black pixels.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>near</td> <td>Int</td> <td>Select how far from black, white or custom colors the pixel values can be and still considered near black, white or custom color.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Converts nearly black/white borders to black.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.nearBlackByGDAL").execute(
    dem,"True","",15,"")
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.reproject

###### 描述

Force a coverage to be computed in a given projection

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to reproject.</td> </tr> <tr> <td>crsCode</td> <td>Int</td> <td>The code of new projection.</td> </tr> <tr> <td>resolution</td> <td>Int</td> <td>The resolution of reprojected image.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Force a coverage to be computed in a given projection</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service.initialize()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b4 = service.getProcess("Coverage.selectBands").execute(lc08, ["B4"])
# 调用函数处理数据
res = service.getProcess("Coverage.reproject").execute(b4, 3857, 100)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
res.styles(vis_params).getMap("res")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.remap

###### 描述

Maps from input values to output values, rerosented by two parallel lists. Any input values not included in the input list are either set to defaultValue if it is given, or masked if it isn't. Note that inputs containing floating point values might sometimes fail to match due to floating point precision errors.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to remap.</td> </tr> <tr> <td>from</td> <td>List[Int]</td> <td>The key list of the map.</td> </tr> <tr> <td>to</td> <td>List[Double]</td> <td>The value list of the map.</td> </tr> <tr> <td>defaultValue</td> <td>Option[Int]</td> <td>Any input values not included in the input list are either set to defaultValue if it is given, or masked if it isn't.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Maps from input values to output values, represented by two parallel lists. Any input values not included in the input list are either set to defaultValue if it is given, or masked if it isn't. Note that inputs containing floating point values might sometimes fail to match due to floating point precision errors.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service.initialize()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
remap = service.getProcess("Coverage.remap").execute(dem, [1000],[2000])

vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
remap.styles(vis_params).getMap("remap")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.rescaleRasterByQGIS

###### 描述

Rescales raster layer to a new value range.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Digital Terrain Model raster layer.</td> </tr> <tr> <td>minimum</td> <td>Double</td> <td>Minimum pixel value to use in the rescaled layer.</td> </tr> <tr> <td>maximum</td> <td>Double</td> <td>Maximum pixel value to use in the rescaled layer.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>If the raster is multiband, choose a band.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Rescales raster layer to a new value range.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service.initialize()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

# 调用函数处理数据
result = service.getProcess("Coverage.rescaleRasterByQGIS").execute(lc08,0,255,1)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
result.styles(vis_params).getMap("result")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.rescaleByGrass

###### 描述

Rescales the range of category values in a raster map layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>The name of the raster map to be rescaled</td> </tr> <tr> <td>to</td> <td>String</td> <td>The output data range</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Rescales the range of category values in a raster map layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
dem = service.getCoverage(
coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

# 调用函数处理数据
dem16 = service.getProcess("Coverage.toInt16").execute(dem)
ndwi = service.getProcess("Coverage.rescaleByGrass").execute(dem16,"10000,11000")
# 设置渲染模式，其中""min"":-1代表将-1映射到png图像的0，max"": 1代表将1映射到png图像的255，""palette"": [""gold"", ""yellow"", ""brown"", ""lightblue"", ""blue""]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(56.25, 28.40, 9)

```

##### Coverage.clamp

###### 描述

Clamp the raster between low and high.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to clamp.</td> </tr> <tr> <td>low</td> <td>Int</td> <td>The low value.</td> </tr> <tr> <td>high</td> <td>Int</td> <td>The high value.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Clamp the raster between low and high.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

a = service.getProcess("Coverage.clamp").execute(b3, 26, 125)

vis_params = {"min": -1, "max": 1,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 数据转换

##### Coverage.polygonizeByGDAL

###### 描述

Creates vector polygons for all connected regions of pixels in the raster sharing a common pixel value. Each polygon is created with an attribute indicating the pixel value of that polygon.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster layer</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options</td> </tr> <tr> <td>field</td> <td>String</td> <td>Specify the field name for the attributes of the connected regions.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>If the raster is multiband, choose the band you want to use</td> </tr> <tr> <td>eightConnectedness</td> <td>String</td> <td>If not set, raster cells must have a common border to be considered connected (4-connected). If set, touching raster cells are also considered connected (8-connected).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates vector polygons for all connected regions of pixels in the raster sharing a common pixel value. Each polygon is created with an attribute indicating the pixel value of that polygon.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

# 裁剪栅格
feature = service.getProcess("Feature.polygon").execute("[[[114.63,30.61], [114.88,30.61], [114.88,30.93],[114.63,30.61]]]", "{a:10}", "EPSG:4326")
b3_clip = service.getProcess("Coverage.clipRasterByMaskLayerByGDAL").execute(b3,feature,"True","","False","","","False","False","","False","0","")
# 调用函数处理数据
res = service.getProcess(
"Coverage.polygonizeByGDAL").execute(b3_clip, "", "DN", 1, "False")
# 重投影至地理坐标系
res_reproject = service.getProcess("Feature.reproject").execute(res,"EPSG:4326")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

# 输出结果
res_reproject.styles("#FFFF00").getMap("res_reproject")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.64, 30.61, 9)

```

##### Coverage.rgbToPctByGDAL

###### 描述

Converts a 24 bit RGB image into a 8 bit paletted.Computes an optimal pseudo-color table for the given RGB-image using a median cut algorithm on a downsampled RGB histogram.Then it converts the image into a pseudo-colored image using the color table.This conversion utilizes Floyd-Steinberg dithering (error diffusion) to maximize output image visual quality.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input (RGB) raster layer</td> </tr> <tr> <td>ncolors</td> <td>Double</td> <td>The number of colors the resulting image will contain. A value from 2-256 is possible.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Converts a 24 bit RGB image into a 8 bit paletted.Computes an optimal pseudo-color table for the given RGB-image using a median cut algorithm on a downsampled RGB histogram.Then it converts the image into a pseudo-colored image using the color table.This conversion utilizes Floyd-Steinberg dithering (error diffusion) to maximize output image visual quality.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 调用函数处理数据
ndwi = service.getProcess("Coverage.rgbToPctByGDAL").execute(lc08,128)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.translateByGDAL

###### 描述

Converts raster data between different formats.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster layer</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Additional GDAL command line options</td> </tr> <tr> <td>targetCrs</td> <td>String</td> <td>Specify a projection for the output file</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>Defines the value to use for nodata in the output raster</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>copySubdatasets</td> <td>String</td> <td>Create individual files for subdatasets</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Converts raster data between different formats.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
layer = service.getProcess(
    "Coverage.translateByGDAL").execute(temp, "", "", 0, "0", "False", "")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
layer.styles(vis_params).getMap("layer")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.warpByGDAL

###### 描述

Reprojects a raster layer into another Coordinate Reference System (CRS). The output file resolution and the resampling method can be chosen.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster layer to reproject</td> </tr> <tr> <td>sourceCrs</td> <td>String</td> <td>Defines the CRS of the input raster layer</td> </tr> <tr> <td>targetCrs</td> <td>String</td> <td>The CRS of the output layer</td> </tr> <tr> <td>resampling</td> <td>String</td> <td>Pixel value resampling method to use. Options:0 — Nearest neighbour 1 — Bilinear 2 — Cubic 3 — Cubic spline 4 — Lanczos windowed sinc 5 — Average 6 — Mode 7 — Maximum 8 — Minimum 9 — Median 10 — First quartile 11 — Third quartile</td> </tr> <tr> <td>noData</td> <td>Double</td> <td>Sets nodata value for output bands. If not provided, then nodata values will be copied from the source dataset.</td> </tr> <tr> <td>targetResolution</td> <td>Double</td> <td>Defines the output file resolution of reprojection result</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the format of the output raster file.</td> </tr> <tr> <td>targetExtent</td> <td>String</td> <td>Sets the georeferenced extent of the output file to be created</td> </tr> <tr> <td>targetExtentCrs</td> <td>String</td> <td>Specifies the CRS in which to interpret the coordinates given for the extent of the output file. This must not be confused with the target CRS of the output dataset. It is instead a convenience e.g. when knowing the output coordinates in a geodetic long/lat CRS, but wanting a result in a projected coordinate system.</td> </tr> <tr> <td>multiThreading</td> <td>String</td> <td>Two threads will be used to process chunks of the image and perform input/output operations simultaneously. Note that the computation itself is not multithreaded.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Reprojects a raster layer into another Coordinate Reference System (CRS). The output file resolution and the resampling method can be chosen.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.warpByGDAL").execute(
    dem, "", "EPSG:4326", "0", 0, 30, "", "0", "", "", "False", "")

vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### CoverageCollection.mergeCoverages

###### 描述

Coverages转为CoverageCollection类型

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverages</td> <td>List&lt;coverage&gt;</td> <td>A list of coverages.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>names</td> <td>List&lt;string&gt;</td> <td>A list of names of coverages.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

dem1 = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
dem2 = service.getCoverage(coverageID="ASTGTM_N28E055", productID="ASTER_GDEM_DEM30")
dem = service.getProcess("CoverageCollection.mergeCoverages").execute([dem1,dem2],["dem1","dem2"])
dem = service.getProcess("CoverageCollection.mosaic").execute(dem)
vis_params = {}
dem1.styles(vis_params).getMap("dem1")
dem2.styles(vis_params).getMap("dem2")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 数据显示

##### Coverage.addStyles

###### 描述

添加样式

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to be added styles</td> </tr> <tr> <td>bands</td> <td>List&lt;string&gt;</td> <td>Comma-delimited list of three band names to be mapped to RGB</td> </tr> <tr> <td>gain</td> <td>double</td> <td>Value(s) by which to multiply each pixel value</td> </tr> <tr> <td>bias</td> <td>double</td> <td>Value(s) to add to each DN</td> </tr> <tr> <td>min</td> <td>double</td> <td>Value(s) to map to 0</td> </tr> <tr> <td>max</td> <td>double</td> <td>Value(s) to map to 255</td> </tr> <tr> <td>gamma</td> <td>Object</td> <td>Gamma correction factor(s)</td> </tr> <tr> <td>opacity</td> <td>Float</td> <td>The opacity of the layer (0.0 is fully transparent and 1.0 is fully opaque)</td> </tr> <tr> <td>palette</td> <td>List&lt;string&gt;</td> <td>List of CSS-style color strings (single-band images only)</td> </tr> <tr> <td>format</td> <td>String</td> <td>Either 'jpg' or 'png'</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

a = service.getProcess("Coverage.addStyles").execute(
    ls8, ["B4", "B3", "B2"], min=-100, max=100, opacity=0.8)

vis_params = {}
ls8.styles(vis_params).getMap("ls8")
a.getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### CoverageCollection.addStyles

###### 描述

添加样式并显示

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>CoverageCollection</td> <td>The coverage collection to be added styles</td> </tr> <tr> <td>bands</td> <td>Object</td> <td></td> </tr> <tr> <td>gain</td> <td>Object</td> <td></td> </tr> <tr> <td>bias</td> <td>Object</td> <td></td> </tr> <tr> <td>min</td> <td>Object</td> <td></td> </tr> <tr> <td>max</td> <td>Object</td> <td></td> </tr> <tr> <td>gamma</td> <td>Object</td> <td></td> </tr> <tr> <td>opacity</td> <td>Float</td> <td></td> </tr> <tr> <td>palette</td> <td>Object</td> <td></td> </tr> <tr> <td>format</td> <td>String</td> <td>png</td> </tr> <tr> <td>method</td> <td>String</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>CoverageCollection</td> <td>CoverageCollection</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 109, 20.1])
# dem = service.getProcess("CoverageCollection.mosaic").execute(dem)
# dem = service.getProcess("Coverage.terrHillshade").execute(dem, 1,1)

# 设置渲染模式
vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中?位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

##### Coverage.blendByGrass

###### 描述

Blends color components of two raster maps by a given ratio.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>first</td> <td>Coverage</td> <td>Name of first raster map for blending</td> </tr> <tr> <td>second</td> <td>Coverage</td> <td>Name of second raster map for blending</td> </tr> <tr> <td>percent</td> <td>String</td> <td>Percentage weight of first map for color blending Options: 0-100</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Blends color components of two raster maps by a given ratio.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b4 = service.getProcess("Coverage.selectBands").execute(ls8, ["B4"])
a = service.getProcess("Coverage.blendByGrass").execute(b3, b4, "50")

vis_params = {"palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")
b3.styles(vis_params).getMap("b3")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.shadeByGrass

###### 描述

Drapes a color raster over an shaded relief or aspect map. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>shade</td> <td>Coverage</td> <td>Name of shaded relief or aspect raster map</td> </tr> <tr> <td>color</td> <td>Coverage</td> <td>Name of raster to drape over relief raster map Typically, this raster is elevation or other colorful raster</td> </tr> <tr> <td>brighten</td> <td>String</td> <td>Percent to brighten Options: -99-99</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Drapes a color raster over an shaded relief or aspect map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b4 = service.getProcess("Coverage.selectBands").execute(ls8, ["B4"])

a = service.getProcess("Coverage.shadeByGrass").execute(b4, b3,"0")

vis_params = {"min": -1, "max": 1,
"palette": ["red","yellow","blue","brown", "lightblue", "green"]}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(115.30, 30.408, 7)

```

##### Coverage.textureByGrass

###### 描述

 Generate images with textural features from a raster map.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>method</td> <td>String</td> <td>Textural measurement method Options: asm, contrast, corr, var, idm, sa, sv, se, entr, dv, de, moc1, moc2</td> </tr> <tr> <td>size</td> <td>String</td> <td>The size of moving window (odd and >= 3)</td> </tr> <tr> <td>distance</td> <td>String</td> <td>The distance between two samples (>= 1) The distance must be smaller than the size of the moving window</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Generate images with textural features from a raster map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndvi = service.getProcess("Coverage.textureByGrass").execute(temp,"3","1","asm")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndvi.styles(vis_params).getMap("ndvi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 10)

```

##### Coverage.reportByGrass

###### 描述

 Reports statistics for raster maps. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>map</td> <td>Coverage</td> <td>Name of raster map to report on</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Reports statistics for raster maps.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

# 调用函数处理数据
repo = service.getProcess(
    "Coverage.reportByGrass").execute(dem)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
repo.log("repo")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 统计分析

##### Coverage.statsByGrass

###### 描述

Generates area statistics for raster map.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of raster map to report on</td> </tr> <tr> <td>flags</td> <td>String</td> <td>select statistics data [-acpl1gxArnNCi]</td> </tr> <tr> <td>separator</td> <td>String</td> <td>Field separator Special characters: pipe, comma, space, tab, newline</td> </tr> <tr> <td>null_value</td> <td>String</td> <td>String representing NULL value</td> </tr> <tr> <td>nsteps</td> <td>String</td> <td>Number of floating-point subranges to collect stats from</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Generates area statistics for raster map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

a = service.getProcess("Coverage.statsByGrass").execute(temp, "p","space","*","255")
a.log("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

### 3.1.2 数学分析工具

#### 加

##### Coverage.add

###### 描述

如果两个影像都只含有一个波段，则将两个波段相加；如果两个影像中存在多个波段，则对应波段相加。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

a = service.getProcess("Coverage.add").execute(b3, b2)

vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 减

##### Coverage.subtract

###### 描述

如果两个影像都只含有一个波段，则将两个波段相减；如果两个影像中存在多个波段，则对应波段相减。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 选取波段
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

# 调用函数处理数据
a = service.getProcess("Coverage.subtract").execute(b3, b2)
# 设置渲染模式，其中"min":-100代表将-100映射到png图像的0，max": 100代表将100映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {}

a.styles(vis_params).getMap("res")
# 设置可视化地图中心和显示层级
oge.mapclient.centerMap(114.30, 30.608, 8)

```

##### Coverage.subtractNum

###### 描述

Subtract the corresponding value from the coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value for subtract.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Subtract the corresponding value from the coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.subtractNum").execute(dem, 1.0)
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 乘

##### Coverage.multiplyNum

###### 描述

Multiply the corresponding value to the coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value for multiply.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Multiply the corresponding value to the coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

# 调用函数处理数据
a = service.getProcess(
"Coverage.multiplyNum").execute(b3, 2)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 幂

##### Coverage.pow

###### 描述

乘方计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 选取波段
b5 = service.getProcess("Coverage.selectBands").execute(lc08, ["B5"])
b5 = service.getProcess("Coverage.subtractNum").execute(b5, 15000)
# 调用函数处理数据
a = service.getProcess("Coverage.signum").execute(b5)
a = service.getProcess("Coverage.pow").execute(b5,a)
# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.powNum

###### 描述

Raises the first coverage to the power of the value.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value for pow.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Raises the first coverage to the power of the value.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b4 = service.getProcess("Coverage.selectBands").execute(lc08, ["B4"])
# 调用函数处理数据
r = service.getProcess("Coverage.powNum").execute(b4, 2.0)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
r.styles(vis_params).getMap("r")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 除

##### Coverage.divide

###### 描述

如果两个影像都只含有一个波段，则将两个波段相除；如果两个影像中存在多个波段，则对应波段相除。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
b3 = service.getProcess("Coverage.toFloat").execute(b3)
b2 = service.getProcess("Coverage.toFloat").execute(b2)

a = service.getProcess("Coverage.divide").execute(b2, b3)

vis_params = {"palette": ["yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.divideNum

###### 描述

Divide the corresponding value from the coverage.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> <tr> <td>i</td> <td>Double</td> <td>The value for divide.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Divide the corresponding value from the coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(lc08, ["B2"])
dN = service.getProcess(
    "Coverage.divideNum").execute(b2, 2.0)
vis_params = {'min': -1, 'max': 1, 'palette': ["yellow", "brown", "green"]}
dN.styles(vis_params).getMap("dN")
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 转为浮点型

##### Coverage.toFloat

###### 描述

Casts the input value to a 32-bit float.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a 32-bit float.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toFloat").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.toDouble

###### 描述

Casts the input value to a 64-bit float.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a 64-bit float.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toDouble").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 转为整型

##### Coverage.toInt8

###### 描述

Casts the input value to a signed 8-bit integer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a signed 8-bit integer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toInt8").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.toInt16

###### 描述

Casts the input value to a unsigned 16-bit integer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a unsigned 16-bit integer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toUint16").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -100, 'max': 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.toInt32

###### 描述

Casts the input value to a signed 32-bit integer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a signed 32-bit integer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toInt32").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.toUint8

###### 描述

Casts the input value to a unsigned 8-bit integer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a unsigned 8-bit integer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toUint8").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -100, 'max': 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.toUint16

###### 描述

Casts the input value to a unsigned 16-bit integer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Casts the input value to a unsigned 16-bit integer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.toUint16").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -100, 'max': 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 按位

##### Coverage.bitwiseAnd

###### 描述

Calculates the bitwise AND of the input values for each matched pair of bands in image1 and image2. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>First coverage rdd to operate.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>Second coverage rdd to operate.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the bitwise AND of the input values for each matched pair of bands in image1 and image2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
a = service.getProcess("Coverage.bitwiseAnd").execute(b3, b2)
vis_params = {"min": -255, "max": 255,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")
# b3.styles(vis_params).getMap("b3")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.bitwiseOr

###### 描述

Calculates the bitwise Or of the input values for each matched pair of bands in image1 and image2. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>First coverage rdd to operate.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>Second coverage rdd to operate.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the bitwise Or of the input values for each matched pair of bands in image1 and image2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
a = service.getProcess("Coverage.bitwiseOr").execute(b3, b2)

vis_params = {"min": -255, "max": 255,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.bitwiseXor

###### 描述

Calculates the bitwise XOR of the input values for each matched pair of bands in coverage1 and coverage2. If both have only 1 band, the 2 band will match

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>First coverage to operate.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>First coverage to operate.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the bitwise XOR of the input values for each matched pair of bands in coverage1 and coverage2. If both have only 1 band, the 2 band will match</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b4 = service.getProcess("Coverage.selectBands").execute(ls8, ["B4"])
a = service.getProcess("Coverage.bitwiseOr").execute(b3, b4)

vis_params = {"min": -255, "max": 255,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 取反

##### Coverage.bitwiseNot

###### 描述

Calculates the bitwise Not of the input values for a coverage. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>Coverage to operate.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the bitwise Not of the input values for a coverage.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
a = service.getProcess("Coverage.bitwiseNot").execute(b3)

vis_params = {"min": -255, "max": 255,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")
# b3.styles(vis_params).getMap("b3")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 逻辑

##### Coverage.lt

###### 描述

Returns 1 iff the first value is less than the second for each matched pair of bands in coverage1 and coverage2.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The first coverage for operation.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The second coverage for operation.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Returns 1 iff the first value is less than the second for each matched pair of bands in coverage1 and coverage2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
lt = service.getProcess("Coverage.lt").execute(b3, b2)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
lt.styles(vis_params).getMap("lt")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.lte

###### 描述

Returns 1 iff the first value is equal or less to the second for each matched pair of bands in coverage1 and coverage2.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The first coverage for operation.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The second coverage for operation.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Returns 1 iff the first value is equal or less to the second for each matched pair of bands in coverage1 and coverage2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
lte = service.getProcess("Coverage.lte").execute(b3, b2)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
lte.styles(vis_params).getMap("lte")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.neq

###### 描述

像素值不相等返回1

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

# 调用函数处理数据
a = service.getProcess("Coverage.neq").execute(b3, b2)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.gt

###### 描述

如果对于coverage1和coverage2中的每对匹配的波段，coverage1的值大于coverage2的值，则返回1。如果两个coverage都只有一个波段，则是波段间的equal操作。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>Coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
gt = service.getProcess("Coverage.gt").execute(b3, b2)
vis_params = { "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
gt.styles(vis_params).getMap("gt")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.gte

###### 描述

如果对于coverage1和coverage2中的每对匹配的波段，coverage1的值大于等于coverage2的值，则返回1。如果两个coverage都只有一个波段，则是波段间的equal操作。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage1</td> <td>Coverage</td> <td>The Coverage from which the left operand bands are taken.</td> </tr> <tr> <td>Coverage2</td> <td>Coverage</td> <td>The Coverage from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
gte = service.getProcess("Coverage.gte").execute(b2, b3)
vis_params = {
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
gte.styles(vis_params).getMap("gte")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 对数

##### Coverage.log

###### 描述

Computes the natural logarithm of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the natural logarithm of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b3 = service.getProcess("Coverage.divideNum").execute(b3,20)
log = service.getProcess(
    "Coverage.log").execute(b3)
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
log.styles(vis_params).getMap("log")
oge.mapclient.centerMap(114.30, 30.608, 8)

```

##### Coverage.log10

###### 描述

Computes the base-10 logarithm of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the base-10 logarithm of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
log = service.getProcess(
    "Coverage.log10").execute(b3)
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
log.styles(vis_params).getMap("log")
oge.mapclient.centerMap(114.30, 0.608, 8)

```

#### 平方根

##### Coverage.sqrt

###### 描述

Computes the square root of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The image to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the square root of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.sqrt").execute(dem)
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 三角函数

##### Coverage.tan

###### 描述

Computes the tangent in radians of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the tangent in radians of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
    "Coverage.tan").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.tanh

###### 描述

Computes the hyperbolic tangent in radians of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the hyperbolic tangent in radians of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
temp = service.getProcess("Coverage.log10").execute(temp)
temp = service.getProcess("Coverage.tanh").execute(temp)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
temp.styles(vis_params).getMap("tanh")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### abs

##### Coverage.abs

###### 描述

计算影像每个像素的绝对值

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The Coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00",productID = "LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

a = service.getProcess("Coverage.abs").execute(b3)
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
b3.styles(vis_params).getMap("b3")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 立方根

##### Coverage.cbrt

###### 描述

Computes the cubic root of the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The image to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the cubic root of the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

a = service.getProcess("Coverage.cbrt").execute(b3)

vis_params = {"min": -1, "max": 1,
              "palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {"min": 0, "max": 255, "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 二值化

##### Coverage.binarization

###### 描述

覆盖数据二值化

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage from which the left operand bands are taken</td> </tr> <tr> <td>threshold</td> <td>Int</td> <td>threshold</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()

# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
lc08 = service.getProcess("Coverage.toFloat").execute(lc08)
# 调?函数处理数据
ndvi = service.getProcess("Coverage.normalizedDifference").execute(lc08, ["B5", "B4"])
ndvi = service.getProcess("Coverage.multiplyNum").execute(ndvi, 100.0)
# 二值化
Ndvi_binarization = service.getProcess("Coverage.binarization").execute(ndvi, 3)
# 中值滤波
Ndvi_binarization_Median = service.getProcess("Coverage.focalMedian").execute(Ndvi_binarization,"square",1)
# 设置渲染模式
vis_params = { "palette": ["black","white"]}
# 输出结果
Ndvi_binarization_Median.styles(vis_params).getMap("NDVI")
# 设置前端地图中?位置
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 1符号函数计算

##### Coverage.signum

###### 描述

计算符号函数(1，0，-1)

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The Coverage to which the operation is applied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 选取波段
b5 = service.getProcess("Coverage.selectBands").execute(lc08, ["B5"])
b5 = service.getProcess("Coverage.subtractNum").execute(b5, 15000)
# 调用函数处理数据
a = service.getProcess("Coverage.signum").execute(b5)
# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {"palette": ["gold",  "brown",  "blue"]}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 多项式计算

##### Coverage.polynomial

###### 描述

按系数计算多项式，系数list从常数项开始

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The input Coverage.</td> </tr> <tr> <td>coefficients</td> <td>List&lt;float&gt;</td> <td>The polynomial coefficients in increasing order of degree starting with the constant term.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

# 调用函数处理数据
a = service.getProcess(
"Coverage.polynomial").execute(b3, [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0])

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
a.styles(vis_params).getMap("a")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 取整

##### Coverage.round

###### 描述

Computes the integer nearest to the input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage for operation.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the integer nearest to the input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b4 = service.getProcess("Coverage.selectBands").execute(lc08, ["B4"])
# 调用函数处理数据
ndwi = service.getProcess("Coverage.round").execute(b4)

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 归一化差异值

##### Coverage.normalizedDifference

###### 描述

计算两个波段的 归一化差异值

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The input covergae</td> </tr> <tr> <td>bandNames</td> <td>List&lt;string&gt;</td> <td>A list of names specifying the bands to use. If not specified, the first and second bands are used</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The output Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
lc08 = service.getProcess("Coverage.toFloat").execute(lc08)
# 调用函数处理数据
ndwi = service.getProcess(
"Coverage.normalizedDifference").execute(lc08, ["B5", "B4"])

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

### 3.1.3 提取分析工具

#### 裁剪

##### Coverage.clipRasterByMaskLayerByGDAL

###### 描述

Clips any GDAL-supported raster by a vector mask layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>cropToCutLine</td> <td>String</td> <td>Applies the vector layer extent to the output raster if checked.</td> </tr> <tr> <td>targetExtent</td> <td>String</td> <td>Extent of the output file to be created.</td> </tr> <tr> <td>setResolution</td> <td>String</td> <td>Shall the output resolution (cell size) be specified.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>targetCrs</td> <td>String</td> <td>Set the coordinate reference to use for the mask layer.</td> </tr> <tr> <td>xResolution</td> <td>Double</td> <td>The width of the cells in the output raster.</td> </tr> <tr> <td>keepResolution</td> <td>String</td> <td>The resolution of the output raster will not be changed.</td> </tr> <tr> <td>alphaBand</td> <td>String</td> <td>Creates an alpha band for the result. The alpha band then includes the transparency values of the pixels.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> <tr> <td>mask</td> <td>String</td> <td>Vector mask for clipping the raster.</td> </tr> <tr> <td>multithreading</td> <td>String</td> <td>Two threads will be used to process chunks of image and perform input/output operation simultaneously. Note that computation is not multithreaded itself.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>Defines a value that should be inserted for the nodata values in the output raster.</td> </tr> <tr> <td>yResolution</td> <td>Double</td> <td>The height of the cells in the output raster.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the format of the output raster file.</td> </tr> <tr> <td>sourceCrs</td> <td>String</td> <td>Set the coordinate reference to use for the input raster.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Clips any GDAL-supported raster by a vector mask layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
#初始化
oge.initialize()
service = oge.Service()
#获取dem
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
#构建shp
feature = service.getProcess("Feature.polygon").execute("[[[56.19,28.54], [56.24,28.23], [56.88,28.47],[56.19,28.54]]]", "{a:10}", "EPSG:4326")
#裁剪栅格
clip = service.getProcess("Coverage.clipRasterByMaskLayerByGDAL").execute(dem,feature,"True","","False","","","False","False","","False","0","")
vis_params = {"min": -10, "max": 10,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

clip .styles(vis_params).getMap("clip")
oge.mapclient.centerMap(56.25, 28.40, 10)

```

#### 选择

##### Coverage.selectBands

###### 描述

从一个Coverage选择任意多个波段

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The image from which the left operand bands are taken.</td> </tr> <tr> <td>bands</td> <td>List&lt;string&gt;</td> <td>A list of names specifying the bands to be selected</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The output Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 选取波段
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

# 调用函数处理数据
a = service.getProcess("Coverage.add").execute(b3, b2)
# 设置渲染模式，其中"min":-100代表将-100映射到png图像的0，max": 100代表将100映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式
vis_params = {
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
# 设置可视化地图中心和显示层级
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.slice

###### 描述

Selects a contiguous group of bands from a coverage by position.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage from which to select bands.</td> </tr> <tr> <td>start</td> <td>Int</td> <td>Where to start the selection.</td> </tr> <tr> <td>end</td> <td>Int</td> <td>Where to end the selection.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Selects a contiguous group of bands from a coverage by position.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")

sliced = service.getProcess("Coverage.slice").execute(ls8, 0,3)
vis_params = {}

sliced.styles(vis_params).getMap("sliced")
oge.mapclient.centerMap(114.30, 30.57, 9)

```

### 3.1.4 叠加分析工具

#### 相交

##### Coverage.crossByGrass

###### 描述

Creates a cross product of the category values from multiple raster map layers.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>CoverageCollection</td> <td>Names of 2-30 input raster maps</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Creates a cross product of the category values from multiple raster map layers.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])
dem = service.getProcess("Coverage.crossByGrass").execute(dem)

# 设置渲染模式
vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中?位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

#### 重合

##### Coverage.coinByGrass

###### 描述

Tabulates the mutual occurrence (coincidence) of categories for two raster map layers.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>first</td> <td>Coverage</td> <td>Name of first raster map</td> </tr> <tr> <td>second</td> <td>Coverage</td> <td>Name of second raster map</td> </tr> <tr> <td>units</td> <td>String</td> <td>Unit of measure c(ells), p(ercent), x(percent of category [column]), y(percent of category [row]), a(cres) h(ectares), k(square kilometers), m(square miles)Options: c,p,x,y,a,h,k,m</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Tabulates the mutual occurrence (coincidence) of categories for two raster map layers.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")

temp1 = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])
temp2 = service.getProcess("Coverage.selectBands").execute(lc08, ["B4"])
feature = service.getProcess("Feature.polygon").execute("[[[115,30.3], [115.1,30.3], [115.1,30.4],[115,30.4],[115,30.3]]]", "{a:10}", "EPSG:4326")
clip1 = service.getProcess("Coverage.clipRasterByMaskLayerByGDAL").execute(temp1,feature,"True","","False","","","False","False","","False","0","")
clip2 = service.getProcess("Coverage.clipRasterByMaskLayerByGDAL").execute(temp2,feature,"True","","False","","","False","False","","False","0","")
a = service.getProcess("Coverage.coinByGrass").execute(clip1, clip2,"a")
a.log("a")
oge.mapclient.centerMap(114.30, 30.608, 6)

```

#### 拼接

##### CoverageCollection.mosaic

###### 描述

拼接

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverageCollection</td> <td>CoverageCollection</td> <td>The coverage from which the left operand bands are taken</td> </tr> <tr> <td>method</td> <td>String</td> <td>the method to mosaic the coverages</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()

# 读取数据
dem = service.getCoverageCollection("ASTER_GDEM_DEM30",["2000-01-01 00:00:00,2000-01-01 00:00:00"],[108.5, 18.1, 111, 20.1])
dem = service.getProcess("CoverageCollection.mosaic").execute(dem)
# dem = service.getProcess("Coverage.terrHillshade").execute(dem, 1,1)

# 设置渲染模式
vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
# 输出结果
dem.styles(vis_params).getMap("dem")
# 设置前端地图中?位置
oge.mapclient.centerMap(109.7, 19.1, 9)

```

### 3.1.5 重采样工具

#### 重采样

##### Coverage.resampFilterByGrass

###### 描述

Resamples raster map layers using an analytic kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>filter</td> <td>String</td> <td>Filter kernel(s) Options: box, bartlett, gauss, normal, hermite, sinc, lanczos1, lanczos2, lanczos3, hann, hamming, blackman</td> </tr> <tr> <td>radius</td> <td>String</td> <td>Filter radius</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Resamples raster map layers using an analytic kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
idw = service.getProcess("Coverage.resampFilterByGrass").execute(temp,"100","box","50")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.resampInterpByGrass

###### 描述

Resamples raster map to a finer grid using interpolation

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>method</td> <td>String</td> <td>Sampling interpolation method Options: nearest, bilinear, bicubic, lanczos</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Resamples raster map to a finer grid using interpolation</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
idw = service.getProcess("Coverage.resampInterpByGrass").execute(temp,"100","bilinear")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.resampStatsByGrass

###### 描述

Resamples raster map layers to a coarser grid using aggregation

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>method</td> <td>String</td> <td>Aggregation method</td> </tr> <tr> <td>quantile</td> <td>Float</td> <td>Quantile to calculate for method=quantile Options: 0.0-1.0</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Resamples raster map layers to a coarser grid using aggregation</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
idw = service.getProcess("Coverage.resampStatsByGrass").execute(temp,"100","average","0.5")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 10)

```

##### Coverage.resampleByGrass

###### 描述

GRASS raster map layer data resampling capability. 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>res</td> <td>String</td> <td>New resolution ratio after resampling</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>GRASS raster map layer data resampling capability.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
idw = service.getProcess("Coverage.resampleByGrass").execute(temp,"100")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(115.67, 30.47, 8)

```

### 3.1.6 邻域分析工具

#### 滤波器

##### Coverage.focalMean

###### 描述

均值滤波

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>kernelType</td> <td>String</td> <td>The type of kernel to use.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to use.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
focalMean = service.getProcess("Coverage.focalMean").execute(b2, "square", 5) # 这里只对单波段进行了运算
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
focalMean.styles(vis_params).getMap("focalMean")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.focalMedian

###### 描述

中值滤波

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>kernelType</td> <td>String</td> <td>The type of kernel to use.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to use.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
focalMedian = service.getProcess(
    "Coverage.focalMedian").execute(b2, "circle", 5)
vis_params = {
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
focalMedian.styles(vis_params).getMap("focalMedian")
oge.mapclient.centerMap(114.30, 30.608, 11)

```

#### 卷积核

##### Kernel.chebyshev

###### 描述

Generates a distance kernel based on Chebyshev distance (greatest distance along any dimension).

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a distance kernel based on Chebyshev distance (greatest distance along any dimension).</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.chebyshev").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.circle

###### 描述

Generates a circle-shaped boolean kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a circle-shaped boolean kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.circle").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.compass

###### 描述

Generates a 3x3 Prewitt's Compass edge-detection kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a 3x3 Prewitt's Compass edge-detection kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.compass").execute(False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.diamond

###### 描述

Generates a diamond-shaped boolean kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a diamond-shaped boolean kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.diamond").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.euclidean

###### 描述

Generates a distance kernel based on Euclidean (straight-line) distance.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a distance kernel based on Euclidean (straight-line) distance.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.euclidean").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.gaussian

###### 描述

Generates a Gaussian kernel from a sampled continuous Gaussian.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>sigma</td> <td>Float</td> <td>Standard deviation of the Gaussian function (same units as radius).</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a Gaussian kernel from a sampled continuous Gaussian.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.gaussian").execute(1,1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.inverse

###### 描述

Returns a kernel which has each of its weights multiplicatively inverted. Weights with a value of zero are not inverted and remain zero.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>kernel1</td> <td>Kernel</td> <td>The first kernel.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Returns a kernel which has each of its weights multiplicatively inverted. Weights with a value of zero are not inverted and remain zero.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.circle").execute(1,False,1)
kernel = service.getProcess("Kernel.inverse").execute(kernel)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.manhattan

###### 描述

Generates a distance kernel based on rectilinear (city-block) distance.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a distance kernel based on rectilinear (city-block) distance.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.manhattan").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.octagon

###### 描述

Generates an octagon-shaped boolean kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates an octagon-shaped boolean kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.octagon").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.plus

###### 描述

Generates a rectangular-shaped kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a rectangular-shaped kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.plus").execute(1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.rectangle

###### 描述

Generates a plus-shaped boolean kernel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>xradius</td> <td>Int</td> <td>The horizontal radius of the kernel to generate.</td> </tr> <tr> <td>yradius</td> <td>Int</td> <td>The vertical radius of the kernel to generate.</td> </tr> <tr> <td>normalize</td> <td>Boolean</td> <td>Normalize the kernel values to sum to 1.</td> </tr> <tr> <td>magnitude</td> <td>Float</td> <td>Scale each value by this amount.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Generates a plus-shaped boolean kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.rectangle").execute(3,3,False,1.0)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Kernel.rotate

###### 描述

Rotate the kernel according to the rotations.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>kernel</td> <td>Kernel</td> <td>The kernel to be rotated.</td> </tr> <tr> <td>rotations</td> <td>Int</td> <td>Rotations to make (negative numbers rotate counterclockwise).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Kernel</td> <td>Kernel</td> <td>Rotate the kernel according to the rotations.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
# 参数写x或y
kernel = service.getProcess("Kernel.chebyshev").execute(1,False,1)
k = service.getProcess("Kernel.rotate").execute(kernel,1)
a = service.getProcess("Coverage.convolve").execute(b3,k)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 卷积运算

##### Coverage.convolve

###### 描述

应用卷积核进行卷积计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The Coverage to convolve.</td> </tr> <tr> <td>kernel</td> <td>Kernel</td> <td>The kernel to convolve with.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
kernel = service.getProcess("Kernel.gaussian").execute(1,1,False,1)
a = service.getProcess("Coverage.convolve").execute(b3,kernel)

vis_params = { "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
a.styles(vis_params).getMap("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.focalMax

###### 描述

核内最大

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>kernelType</td> <td>String</td> <td>The type of kernel to use.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to use.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
focalMax = service.getProcess("Coverage.focalMax").execute(b2, "square", 5) # 这里只对单波段进行了运算
vis_params = {
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
focalMax.styles(vis_params).getMap("focalMax")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.focalMin

###### 描述

核内最小

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>kernelType</td> <td>String</td> <td>The type of kernel to use.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to use.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
focalMin = service.getProcess(
    "Coverage.focalMin").execute(b2, "circle", 5)
vis_params = {
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
focalMin.styles(vis_params).getMap("focalMin")
oge.mapclient.centerMap(114.30, 30.608, 11)

```

##### Coverage.entropy

###### 描述

Computes the windowed entropy using the specified kernel centered on each input pixel. Entropy is computed as -sum(p * log2(p)), where p is the normalized probability of occurrence of the values encountered in each window.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the entropy.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the entropy, 1 for a 3×3 square.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the windowed entropy using the specified kernel centered on each input pixel. Entropy is computed as -sum(p * log2(p)), where p is the normalized probability of occurrence of the values encountered in each window.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(lc08, ["B2"])

entro = service.getProcess("Coverage.entropy").execute(b2, 2)
vis_params = {'min': -100, 'max': 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
entro.styles(vis_params).getMap("entro")
oge.mapclient.centerMap(114.28, 30.57, 9)

```

##### Coverage.focalMode

###### 描述

Applies a morphological mode filter to each band of an coverage using a named or custom kernel. Mode does not currently support Double raster data. If you use a raster with a Double CellType, the raster will be rounded to integers.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to which to apply the operations.</td> </tr> <tr> <td>kernelType</td> <td>String</td> <td>The type of kernel to use.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the kernel to use.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Applies a morphological mode filter to each band of an image using a named or custom kernel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
focalMode = service.getProcess(
    "Coverage.focalMode").execute(b2, "circle", 5)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
focalMode.styles(vis_params).getMap("focalMode")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 缓冲区

##### Coverage.bufferByGrass

###### 描述

Creates a raster map showing buffer zones surrounding cells that contain non-NULL category values.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map.</td> </tr> <tr> <td>distances</td> <td>String</td> <td>Distance zone(s)</td> </tr> <tr> <td>unit</td> <td>String</td> <td>Units of distance Options: meters, kilometers, feet,miles, nautmiles</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Creates a raster map showing buffer zones surrounding cells that contain non-NULL category values.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
a = service.getProcess("Coverage.bufferByGrass").execute(b3,'5','meters')

vis_params = {"palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = { "palette": ["yellow", "blue"]}
a.styles(vis_params).getMap("a")
b3.styles(vis_params).getMap("b3")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 邻域分析

##### Coverage.neighborsByGrass

###### 描述

Makes each cell category value a function of the category values assigned to the cells around it,and stores new cell values in an output raster map layers.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>size</td> <td>String</td> <td>Neighborhood size</td> </tr> <tr> <td>method</td> <td>String</td> <td>Neighborhood operation Options: average, median, mode, minimum , maximum, range, stddev, sum, count variance,diversity, nterspersion,quart1,quart3,perc90,quantile</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Makes each cell category value a function of the category values assigned to the cells around it,and stores new cell values in an output raster map layers.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
ls8 = service.getCoverage(
coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])

# 调用函数处理数据
ndwi = service.getProcess(
"Coverage.neighborsByGrass").execute(b3, "3", "average")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，"max": 1代表将1映射到png图像的255，
# "palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndwi.styles(vis_params).getMap("ndwi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 邻近分析

##### Coverage.proximityByGDAL

###### 描述

Generates a raster proximity map indicating the distance from the center of each pixel to the center of the nearest pixel identified as a target pixel.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>Specify the nodata value to use for the output raster.</td> </tr> <tr> <td>values</td> <td>String</td> <td>A list of target pixel values in the source image to be considered target pixels.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>Band containing the elevation information.</td> </tr> <tr> <td>maxDistance</td> <td>Double</td> <td>The maximum distance to be generated.</td> </tr> <tr> <td>replace</td> <td>Double</td> <td>Specify a value to be applied to all pixels that are closer than the maximum distance from target pixels (including the target pixels) instead of a distance value.</td> </tr> <tr> <td>units</td> <td>String</td> <td>Indicate whether distances generated should be in pixel or georeferenced coordinates.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Generates a raster proximity map indicating the distance from the center of each pixel to the center of the nearest pixel identified as a target pixel.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.proximityByGDAL").execute(
    dem,"",0.0,"",1,1,0.0,"1","5","")
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

### 3.1.7 插值工具

#### 样条插值

##### Coverage.resampBsplineByGrass

###### 描述

Performs bilinear or bicubic spline interpolation with Tykhonov regularization.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>method</td> <td>String</td> <td>Spline interpolation algorithm Options: bilinear, bicubic</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Performs bilinear or bicubic spline interpolation with Tykhonov regularization.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

# 调用函数处理数据
idw = service.getProcess("Coverage.resampBsplineByGrass").execute(temp,"500","bicubic")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(114.28, 30.57, 9)

```

#### 空间插值

##### Coverage.surfIdwByGrass

###### 描述

Provides surface interpolation from raster point data by Inverse Distance Squared Weighting.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>npoints</td> <td>String</td> <td>Number of interpolation points</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Provides surface interpolation from raster point data by Inverse Distance Squared Weighting.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
dem = service.getCoverage(
    coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

# 调用函数处理数据
dem16 = service.getProcess(
    "Coverage.toInt16").execute(dem)
idw = service.getProcess("Coverage.surfIdwByGrass").execute(dem16,"12")

# 设置渲染模式，其中""min"":-1代表将-1映射到png图像的0，max"": 1代表将1映射到png图像的255，""palette"": [""gold"", ""yellow"", ""brown"", ""lightblue"", ""blue""]设置了渲染模式

vis_params = {'min': -1, 'max': 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
idw.styles(vis_params).getMap("idw")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(56.25, 28.40, 9)

```

### 3.1.8 局部分析工具

#### 合并

##### Coverage.compositeByGrass

###### 描述

Combines red, green and blue raster maps into a single composite raster map.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>red</td> <td>Coverage</td> <td>Name of raster map to be used for &lt;red&gt;&lt;/red&gt;</td> </tr> <tr> <td>green</td> <td>Coverage</td> <td>Name of raster map to be used for &lt;green&gt;&lt;/green&gt;</td> </tr> <tr> <td>blue</td> <td>Coverage</td> <td>Name of raster map to be used for &lt;blue&gt;&lt;/blue&gt;</td> </tr> <tr> <td>levels</td> <td>String</td> <td>Number of levels to be used for each component Options: 1-256</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Combines red, green and blue raster maps into a single composite raster map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b4 = service.getProcess("Coverage.selectBands").execute(ls8, ["B4"])
b1 = service.getProcess("Coverage.selectBands").execute(ls8, ["B1"])

a = service.getProcess("Coverage.compositeByGrass").execute(b4, b3, b1 ,'32')

vis_params = {"palette": ["yellow", "brown", "lightblue", "blue"]}
vis_params1 = {}
a.styles(vis_params1).getMap("a")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.cat

###### 描述

Combines the given coverages into a single coverage which contains all bands from all of the images.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The first coverage for cat.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The second coverage for cat.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Combines the given coverages into a single coverage which contains all bands from all of the images.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

dem1 = service.getCoverage(coverageID="ASTGTM_N30E115", productID="ASTER_GDEM_DEM30")
dem2 = service.getCoverage(coverageID="ASTGTM_N30E116", productID="ASTER_GDEM_DEM30")
dem = service.getProcess("Coverage.cat").execute(dem1, dem2)
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).getMap("aspect")
oge.mapclient.centerMap(115, 30, 9)

```

#### 像元统计

##### Coverage.maxi

###### 描述

Selects the maximum of the first and second values for each matched pair of bands in image1 and image2.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The image from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The image from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Selects the maximum of the first and second values for each matched pair of bands in image1 and image2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
maxi = service.getProcess("Coverage.maxi").execute(b3, b2)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
maxi.styles(vis_params).getMap("maxi")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

##### Coverage.mini

###### 描述

Selects the minimum of the first and second values for each matched pair of bands in image1 and image2.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The image from which the left operand bands are taken.</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The image from which the right operand bands are taken.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Selects the minimum of the first and second values for each matched pair of bands in image1 and image2.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
mini = service.getProcess("Coverage.mini").execute(b3, b2)
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
mini.styles(vis_params).getMap("mini")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

### 3.1.9 掩膜工具

#### 掩膜计算

##### Coverage.mask

###### 描述

掩膜计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage1</td> <td>Coverage</td> <td>The input Coverage</td> </tr> <tr> <td>coverage2</td> <td>Coverage</td> <td>The mask Coverage.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
ls8 = service.getCoverage(
    coverageID="LC81220392015275LGN00", productID="LC08_L1T")
b3 = service.getProcess("Coverage.selectBands").execute(ls8, ["B3"])
b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])
mask = service.getProcess("Coverage.mask").execute(b3, b2, 0, 1)
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
mask.styles(vis_params).getMap("mask")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

### 3.1.10 格网化工具

#### 格网化

##### Coverage.gridInverseDistanceByGDAL

###### 描述

The Inverse Distance to a Power gridding method is a weighted average interpolator.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>power</td> <td>Double</td> <td>Weighting power.</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Angle of ellipse rotation in degrees. Ellipse rotated counter clockwise.</td> </tr> <tr> <td>radius2</td> <td>Double</td> <td>The second radius (Y axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>radius1</td> <td>Double</td> <td>The first radius (X axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>smoothing</td> <td>Double</td> <td>Smoothing parameter.</td> </tr> <tr> <td>maxPoints</td> <td>Double</td> <td>Do not search for more points than this number.</td> </tr> <tr> <td>minPoints</td> <td>Double</td> <td>Minimum number of data points to average. If less amount of points found the grid node considered empty and will be filled with NODATA marker.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points.</td> </tr> <tr> <td>zField</td> <td>String</td> <td>Field for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The Inverse Distance to a Power gridding method is a weighted average interpolator.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 创建多个点要素
feature = service.getProcess("Feature.multiPoint").execute("[[38, 10.10], [38,10.5], [38.5, 10.10], [38.5,10.5]]", "{a:10}", "EPSG:4326")
# 网格化
result = service.getProcess("Coverage.gridInverseDistanceByGDAL").execute(feature, "", 2, 0.0, 2, 1, 0.0, 20, 2, 0.0, "a", "6", "")
# 可视化
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
result.styles(vis_params).getMap("result")
feature.styles(vis_params).getMap("points")
oge.mapclient.centerMap(38.255,10.29,9)

```

##### Coverage.gridInverseDistanceNNRByGDAL

###### 描述

Computes the Inverse Distance to a Power gridding combined to the nearest neighbor method.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>power</td> <td>Double</td> <td>Weighting power.</td> </tr> <tr> <td>radius</td> <td>Double</td> <td>The radius of the search circle.</td> </tr> <tr> <td>smoothing</td> <td>Double</td> <td>Smoothing parameter.</td> </tr> <tr> <td>maxPoints</td> <td>Double</td> <td>Do not search for more points than this number.</td> </tr> <tr> <td>minPoints</td> <td>Double</td> <td>Minimum number of data points to average. If less amount of points found the grid node considered empty and will be filled with NODATA marker.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points.</td> </tr> <tr> <td>zField</td> <td>String</td> <td>Field for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the Inverse Distance to a Power gridding combined to the nearest neighbor method.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 创建多个点要素
feature = service.getProcess("Feature.multiPoint").execute("[[38, 10.10], [38,10.5], [38.5, 10.10], [38.5,10.5]]", "{a:10}", "EPSG:4326")
# 网格化
result = service.getProcess("Coverage.gridInverseDistanceNNRByGDAL").execute(feature, "", 2, 1.0, 0.0, 12, 2, 0.0, "a", "6", "")
# 可视化
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
result.styles(vis_params).getMap("result")
feature.styles(vis_params).getMap("points")
oge.mapclient.centerMap(38.255,10.29,9)

```

##### Coverage.gridLinearByGDAL

###### 描述

The Linear method perform linear interpolation by computing a Delaunay triangulation of the point cloud, finding in which triangle of the triangulation the point is, and by doing linear interpolation from its barycentric coordinates within the triangle.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>radius</td> <td>Double</td> <td>In case the point to be interpolated does not fit into a triangle of the Delaunay triangulation, use that maximum distance to search a nearest neighbour, or use nodata otherwise. If set to -1, the search distance is infinite. If set to 0, no data value will be used.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points</td> </tr> <tr> <td>zField</td> <td>String</td> <td>Field for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The Linear method perform linear interpolation by computing a Delaunay triangulation of the point cloud, finding in which triangle of the triangulation the point is, and by doing linear interpolation from its barycentric coordinates within the triangle.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 创建多个点要素
feature = service.getProcess("Feature.multiPoint").execute("[[38, 10.10], [38,10.5], [38.5, 10.10], [38.5,10.5]]", "{a:10}", "EPSG:4326")
# 线性插值
result = service.getProcess("Coverage.gridLinearByGDAL").execute(feature, 1, "", 0.0, "a", "6", "")
# 可视化
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
result.styles(vis_params).getMap("result")
feature.styles(vis_params).getMap("points")
oge.mapclient.centerMap(38.255,10.29,9)

```

##### Coverage.gridNearestNeighborByGDAL

###### 描述

The Nearest Neighbor method doesn’t perform any interpolation or smoothing, it just takes the value of nearest point found in grid node search ellipse and returns it as a result.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points.</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Angle of ellipse rotation in degrees. Ellipse rotated counter clockwise.</td> </tr> <tr> <td>radius1</td> <td>Double</td> <td>The first radius (X axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>radius2</td> <td>Double</td> <td>The second radius (Y axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>zField</td> <td>String</td> <td>Field for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The Nearest Neighbor method doesn’t perform any interpolation or smoothing, it just takes the value of nearest point found in grid node search ellipse and returns it as a result.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 创建多个点要素
feature1 = service.getProcess("Feature.point").execute("[38, 10.10]", "{Te:10", "EPSG:4326")
feature2 = service.getProcess("Feature.point").execute("[38,10.5]", "{Te:11", "EPSG:4326")
feature3 = service.getProcess("Feature.point").execute("[38.5, 10.10]", "{Te:12", "EPSG:4326")
feature4 = service.getProcess("Feature.point").execute("[38.5,10.5]", "{Te:13", "EPSG:4326")
fc = service.getProcess("Feature.featureCollection").execute([feature1,feature2,feature3,feature4])
# 最近邻插值
result = service.getProcess("Coverage.gridNearestNeighborByGDAL").execute(fc,"",0,30.0,0.1,0.2,"Te","6","")
# 可视化
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
result.styles(vis_params).getMap("result")
fc.styles(vis_params).getMap("points")
oge.mapclient.centerMap(38.255,10.29,9)

```

##### Coverage.gridAverageByGDAL

###### 描述

The Moving Average is a simple data averaging algorithm.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>minPoints</td> <td>Double</td> <td>Minimum number of data points to average. If less amount of points found the grid node considered empty and will be filled with NODATA marker.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points.</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Angle of ellipse rotation in degrees. Ellipse rotated counter clockwise.</td> </tr> <tr> <td>zField</td> <td>String</td> <td>AField for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Defines the data type of the output raster file.</td> </tr> <tr> <td>radius2</td> <td>Double</td> <td>The second radius (Y axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>radius1</td> <td>Double</td> <td>The first radius (X axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>The Moving Average is a simple data averaging algorithm.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.point").execute("[38, 10.10]", "{Te:10", "EPSG:4326")
feature2 = service.getProcess("Feature.point").execute("[38,10.11]", "{Te:11", "EPSG:4326")
feature3 = service.getProcess("Feature.point").execute("[38,10.12]", "{Te:12", "EPSG:4326")
feature4 = service.getProcess("Feature.point").execute("[38.01,10.10]", "{Te:13", "EPSG:4326")
feature5 = service.getProcess("Feature.point").execute("[38.01,10.11]", "{Te:14", "EPSG:4326")
feature6 = service.getProcess("Feature.point").execute("[38.01,10.12]", "{Te:15", "EPSG:4326")
fc = service.getProcess("Feature.featureCollection").execute([feature1,feature2,feature3,feature4,feature5,feature6])
result = service.getProcess("Coverage.gridAverageByGDAL").execute(fc,0,"",0,30.0,"Te","6",0.03,0.01,"")
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
fc.styles("#00000").getMap("fc")
result.styles(vis_params).getMap("result")
oge.mapclient.centerMap(38.01,10.11,11)

```

##### Coverage.gridDataMetricsByGDAL

###### 描述

Computes some data metrics using the specified window and output grid geometry.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>minPoints</td> <td>Double</td> <td>Minimum number of data points to average.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>metric</td> <td>String</td> <td>Data metric to use.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>No data marker to fill empty points.</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Angle of ellipse rotation in degrees. Ellipse rotated counter clockwise.</td> </tr> <tr> <td>zField</td> <td>String</td> <td>Field for the interpolation.</td> </tr> <tr> <td>dataType</td> <td>String</td> <td>Output data type.</td> </tr> <tr> <td>radius2</td> <td>Double</td> <td>The second radius (Y axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>radius1</td> <td>Double</td> <td>The first radius (X axis if rotation angle is 0) of the search ellipse.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created (colors, block size, file compression...).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes some data metrics using the specified window and output grid geometry.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 创建多个点要素
feature = service.getProcess("Feature.multiPoint").execute("[[38, 10.10], [38,10.11],[38.01, 10.10], [38.01,10.11]]", "{a:10}", "EPSG:4326")
# 调用算子
a = service.getProcess("Coverage.gridDataMetricsByGDAL").execute(feature, 1, "","5",0.0,0.0,"a","6",0.02,0.01,"")
vis_params = {"min": 0, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}
a.styles(vis_params).getMap("a")
feature.styles(vis_params).getMap("points")
oge.mapclient.centerMap(38.005,10.13,11)

```

### 3.1.11 表面三角化工具

#### 表面积

##### Coverage.surfAreaByGrass

###### 描述

Prints estimation of surface area for raster map.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>map</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>vscale</td> <td>String</td> <td>Vertical scale</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Prints estimation of surface area for raster map.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])

a = service.getProcess("Coverage.surfAreaByGrass").execute(temp, "1.0")
a.log("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 体积

##### Coverage.volumeByGrass

###### 描述

Calculates the volume of data 'clumps'.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map representing data that will be summed within clumps</td> </tr> <tr> <td>clump</td> <td>Coverage</td> <td>Name of input clump raster map</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>String</td> <td>String</td> <td>Calculates the volume of data 'clumps'.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
lc08 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
temp1 = service.getProcess("Coverage.selectBands").execute(lc08, ["B3"])
temp2 = service.getProcess("Coverage.selectBands").execute(lc08, ["B4"])

a = service.getProcess("Coverage.volumeByGrass").execute(temp1, temp2)
a.log("a")
oge.mapclient.centerMap(114.30, 30.608, 10)

```

## 3.2 矢量处理

### 3.2.1 数据工具

#### 数据属性

##### Feature.copyProperties

###### 描述

用source Feature的属性对destination Feature的属性进行重载

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>properties</td> <td>List&lt;string&gt;</td> <td>The properties to copy. If omitted, all properties are copied.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.point").execute("[114.5, 31.3]", "{name:point,b:20}", "EPSG:4326")
feature3= service.getProcess("Feature.copyProperties").execute(feature1,feature2,["name"])
propertyNames= service.getProcess("Feature.propertyNames").execute(feature3)
propertyNames.log("propertyNames")
feature1.styles(["#000000"]).getMap("point1")
feature2.styles(["#000000"]).getMap("point2")
oge.mapclient.centerMap(114.4,30.5,4)

```

##### Feature.get

###### 描述

获取Feature的某个属性

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>property</td> <td>String</td> <td>The property to extract.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;object&gt;</td> <td>List&lt;object&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 加载矢量
feature = service.getFeature(featureId="WHU_Road_Vector")
# 获取属性
osm_id = service.getProcess("Feature.get").execute(feature,"name")
# 可视化
osm_id.log("osm_id")
feature.styles(["#FF0000"]).getMap("WHU_Road_Vector")

oge.mapclient.centerMap(114.3,30.53,12)

```

##### Feature.propertyNames

###### 描述

获取Feature的所有属性名称

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;List&lt;string&gt;&gt;&lt;/string&gt;</td> <td>List&lt;List&lt;string&gt;&gt;&lt;/string&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[114.45,30.51],[114.77,30.67]]", "{name:10,weight:0.7}", "EPSG:4326")
# 获取属性名称
feature_property = service.getProcess("Feature.propertyNames").execute(feature)
# 输出并可视化
feature_property.log("feature_property")
feature.styles(["#000000"]).getMap("feature")
oge.mapclient.centerMap(114.4,30.5,10)

```

##### Feature.set

###### 描述

设置Feature的属性，可以是重载，也可以是新增

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>property</td> <td>String</td> <td>the property to set. it is a json</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 加载矢量
vector = service.getFeature(featureId="WHU_Road_Vector")
# 设置属性
speed_property= service.getProcess("Feature.set").execute(vector,"{speed:11}")
# 可视化
vector.styles(["#FF0000"]).getMap("WHU_Road_Vector")
oge.mapclient.centerMap(114.3,30.53,12)

```

##### Feature.addFieldByQGIS

###### 描述

Adds a new field to a vector layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>fieldType</td> <td>String</td> <td>Type of the new field. You can choose between</td> </tr> <tr> <td>fieldPrecision</td> <td>Double</td> <td>Precision of the field. Useful with Float field type.</td> </tr> <tr> <td>fieldName</td> <td>String</td> <td>Name of the new field</td> </tr> <tr> <td>fieldLength</td> <td>Double</td> <td>Length of the field</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Adds a new field to a vector layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
a = service.getProcess("Feature.addFieldByQGIS").execute(feature, "0", 0, "default", 10)

a.styles(["#000000"]).getMap("a")
oge.mapclient.centerMap(114.28,30.57,10)

```

##### Feature.getType

###### 描述

返回几何对象对应geojson的类型

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;string&gt;</td> <td>List&lt;string&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
featureType=service.getProcess("Feature.getType").execute(feature)
featureType.log("featureType")
oge.mapclient.centerMap(114.2,30.3,15)

```

##### Feature.projection

###### 描述

返回几何对象的投影方式，返回SRID代号

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;int&gt;</td> <td>List&lt;int&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
projection= service.getProcess("Feature.projection").execute(feature)
projection.log("projection")

feature.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.coordinates

###### 描述

返回几何对象的坐标（geojson的风格）

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;List&lt;string&gt;&gt;&lt;/string&gt;</td> <td>List&lt;List&lt;string&gt;&gt;&lt;/string&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35,15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
coordinates = service.getProcess("Feature.coordinates").execute(feature)

coordinates.log("coordinates")
feature.styles(["#111111"]).getMap("feature")

oge.mapclient.centerMap(37,12,5)

```

##### Feature.boundaryByQGIS

###### 描述

Returns the closure of the combinatorial boundary of the input geometries

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input line or polygon vector layer</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Returns the closure of the combinatorial boundary of the input geometries</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成面要素
polygon = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 计算边界
boundary = service.getProcess("Feature.boundaryByQGIS").execute(polygon)
# 可视化
boundary.styles(["#000000"]).getMap("boundary")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.length

###### 描述

返回geometry的长度，不区分多边形周长和线性几何对象的长度

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;double&gt;</td> <td>List&lt;double&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature= service.getFeature(featureId="Yangtze_River_Vector")
length = service.getProcess("Feature.length").execute(feature,"EPSG:3857")
length.log("length")
feature.styles(["#000000"]).getMap("Yangtze_River_Vector")
oge.mapclient.centerMap(114,35,4)

```

##### Feature.isUnbounded

###### 描述

判断geometry是否有边界

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;boolean&gt;</td> <td>List&lt;boolean&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
a = service.getProcess("Feature.isUnbounded").execute(feature)
a.log("a")

feature.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(37,12,5)

```

#### 数据转换

##### Feature.toGeoJSONString

###### 描述

将geometry转为geojson字符串

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;string&gt;</td> <td>List&lt;string&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getFeature(featureId="China_MainRailway_Vector")
geojson=service.getProcess("Feature.toGeoJSONString").execute(feature)
geojson.log("geojson")
feature.styles(["#000000"]).getMap("China_MainRailway_Vector")
oge.mapclient.centerMap(114.2,30.3,3)

```

##### Feature.rasterizeByGDAL

###### 描述

Converts vector geometries (points, lines and polygons) into a raster image.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>field</td> <td>String</td> <td>Defines the attribute field from which the attributes for the pixels should be chosen</td> </tr> <tr> <td>burn</td> <td>Double</td> <td>A fixed value to burn into a band for all features.</td> </tr> <tr> <td>useZ</td> <td>String</td> <td>Indicates that a burn value should be extracted from the “Z” values</td> </tr> <tr> <td>units</td> <td>String</td> <td>Units to use when defining the output raster size/resolution.</td> </tr> <tr> <td>width</td> <td>Double</td> <td>Sets the width (if size units is “Pixels”) or horizontal resolution</td> </tr> <tr> <td>height</td> <td>Double</td> <td>Sets the height (if size units is “Pixels”) or vertical resolution</td> </tr> <tr> <td>extent</td> <td>String</td> <td>Extent of the output raster layer.</td> </tr> <tr> <td>nodata</td> <td>Double</td> <td>Assigns a specified NoData value to output bands</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Converts vector geometries (points, lines and polygons) into a raster image.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 加载面要素
polygon = service.getProcess("Feature.load").execute("Hubei_ADM_County_Vector","null","EPSG:4326")
# 矢量栅格化
raster = service.getProcess("Feature.rasterizeByGDAL").execute(polygon,"Shape_Area",0,"False","1",0.01,0.01,"",0)
# 设置可视化参数
vis_params = {"min": 0, "max": 1}
# 结果上图
raster.styles(vis_params).getMap("raster")
oge.mapclient.centerMap(114.2,30.3,5)  

```

##### Coverage.rasterizeOverByGDAL

###### 描述

Overwrites a raster layer with values from a vector layer. New values are assigned based on the attribute value of the overlapping vector feature.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>inputRaster</td> <td>Coverage</td> <td>Input raster layer</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options</td> </tr> <tr> <td>field</td> <td>String</td> <td>Defines the attribute field to use to set the pixels values</td> </tr> <tr> <td>add</td> <td>String</td> <td>If False, pixels are assigned the selected field’s value. If True, the selected field’s value is added to the value of the input raster layer.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Overwrites a raster layer with values from a vector layer. New values are assigned based on the attribute value of the overlapping vector feature.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()

# 加载tif影像
ls8 = service.getCoverage(coverageID="LC81220392015275LGN00", productID="LC08_L1T")
# 创建用于覆写的矢量图层，用于覆写的字段为"a"
polygon = service.getProcess("Feature.polygon").execute("[[114.8, 30.6],[114.9, 30.6],[114.9, 30.5],[114.8, 30.5], [114.8, 30.6]]", "{a:-100}", "EPSG:4326")
# 覆写栅格影像
ls8_overlapped = service.getProcess("Coverage.rasterizeOverByGDAL").execute(polygon, ls8, "", "a", "True")
# 加载样式
vis_params = {"min": -100, "max": 100,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# line.styles("#000000").getMap("line")
ls8_overlapped.styles(vis_params).getMap("result")
oge.mapclient.centerMap(115.37, 30.278, 7)

```

#### 属性计算

##### Feature.centroid

###### 描述

计算质心

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35,15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
centroid = service.getProcess("Feature.centroid").execute(feature,"EPSG:4326")
feature.styles(["#111111"]).getMap("feature")
centroid.styles(["#000000"]).getMap("centroid")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.convexHull

###### 描述

计算凸包

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建点要素
feature = service.getProcess("Feature.multiPoint").execute("[[35, 10], [35, 15], [40, 15]]", "{a:10}", "EPSG:4326")
# 生成凸包
convexHull = service.getProcess("Feature.convexHull").execute(feature,"EPSG:4326")
# 可视化
feature.styles(["#FFFF00"]).getMap("feature")
convexHull.styles(["#000000"]).getMap("convexHull")
oge.mapclient.centerMap(38,13,5)

```

##### Feature.withDistance

###### 描述

判断两个geometry的距离是否在distance内

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Boolean</td> <td>Boolean</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getFeature(featureId="China_MainRoad_Vector")
feature2 = service.getFeature(featureId="WHU_Road_Vector")
withDistance= service.getProcess("Feature.withDistance").execute(feature1,feature2,20,"EPSG:4326")

withDistance.log("withDistance")
feature1.styles(["#000000"]).getMap("China_MainRoad_Vector")
feature2.styles(["#000000"]).getMap("WHU_Road_Vector")

oge.mapclient.centerMap(114.4,30.5,12)

```

##### Feature.area

###### 描述

面积计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>List&lt;double&gt;</td> <td>List&lt;double&gt;</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
area= service.getProcess("Feature.area").execute(feature, "EPSG:4326")
area.log("area")

feature.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.bounds

###### 描述

返回geometry的最小包围盒。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>Coordinates</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.bounds").execute(feature1, "EPSG:4326")

feature1.styles(["#000000"[).getMap("line")
feature2.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(114,30,5)

```

##### Feature.miniEnclosingCircleByQGIS

###### 描述

Calculates the minimum enclosing circles of the features in the input layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>segments</td> <td>Int</td> <td>The number of segment used to approximate a circle. Minimum 8, maximum 100000.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Calculates the minimum enclosing circles of the features in the input layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成面要素
polygon = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 计算最小包围圆形
boundary = service.getProcess("Feature.miniEnclosingCircleByQGIS").execute(polygon,72)
# 可视化
polygon.styles(["#000000"]).getMap("polygon")
boundary.styles(["#000000"]).getMap("boundary")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.orientedMinimumBoundingBoxByQGIS

###### 描述

Calculates the minimum area rotated rectangle for each feature in the input layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Calculates the minimum area rotated rectangle for each feature in the input layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成环
ring = service.getProcess("Feature.linearRing").execute("[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]", "{a:10}", "EPSG:4326")
# 计算覆盖矩形
result = service.getProcess("Feature.orientedMinimumBoundingBoxByQGIS").execute(ring)
# 可视化
result.styles(["#000000"]).getMap("result")
ring.styles(["#000000"]).getMap("ring")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.poleOfInaccessibilityByQGIS

###### 描述

Calculates the pole of inaccessibility for a polygon layer, which is the most distant internal point from the boundary of the surface.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>tolerance</td> <td>Double</td> <td>Set the tolerance for the calculation</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Calculates the pole of inaccessibility for a polygon layer, which is the most distant internal point from the boundary of the surface.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成面要素
polygon = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 计算最小包围圆形
boundary = service.getProcess("Feature.miniEnclosingCircleByQGIS").execute(polygon,72)
# 计算难抵极点
result = service.getProcess("Feature.poleOfInaccessibilityByQGIS").execute(boundary,0.01)
# 可视化
boundary.styles(["#FFFF00"]).getMap("polygon")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.concaveHullByQGIS

###### 描述

Computes the concave hull of the features in an input point layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>noMultigeometry</td> <td>String</td> <td>Check if you want to have singlepart geometries instead of multipart ones.</td> </tr> <tr> <td>holes</td> <td>String</td> <td>Choose whether to allow holes in the final concave hull.</td> </tr> <tr> <td>alpha</td> <td>Double</td> <td>Number from 0 (maximum concave hull) to 1 (convex hull).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Computes the concave hull of the features in an input point layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 在区域内创建3个点
points = service.getProcess("Feature.multiPoint").execute("[[36, 10], [35, 14], [40, 15]]", "{a:10}", "EPSG:4326")
# 构造3个点的凹/凸包
results = service.getProcess("Feature.concaveHullByQGIS").execute(points, "True", "True", 1) 
# 可视化
results.styles(["#000000"]).getMap("convexHull")
points.styles(["#000000"]).getMap("points")

oge.mapclient.centerMap(37.5,12.29,4)

```

### 3.2.2 要素工具

#### 点要素

##### Feature.point

###### 描述

构造点要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("point")
oge.mapclient.centerMap(114.2,30.3,15)

```

##### Feature.multiPoint

###### 描述

构造多点要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.multiPoint").execute("[[35, 10], [35, 15], [40, 15], [40, 10]]", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("multiPoint")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.pointsAlongLinesByGDAL

###### 描述

Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>The distance from the start of the line</td> </tr> <tr> <td>geometry</td> <td>String</td> <td>The name of the input layer geometry column to use</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the vector layer to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 构建线要素
line = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 沿线要素创建点
result = service.getProcess("Feature.pointsAlongLinesByGDAL").execute(line, 0.5, "geometry", "default")
# 可视化
line.styles(["#FF0000"]).getMap("line")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(115.05,30.68,7)

```

##### Feature.pointOnSurfaceByQGIS

###### 描述

For each feature of the input layer, returns a point that is guaranteed to lie on the surface of the feature geometry.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>allParts</td> <td>String</td> <td>If checked, a point will be created for each part of the geometry.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>For each feature of the input layer, returns a point that is guaranteed to lie on the surface of the feature geometry.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成面
polygon = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 计算要素表面上的点
result = service.getProcess("Feature.pointOnSurfaceByQGIS").execute(polygon,"true")
# 可视化
polygon.styles(["#000000"]).getMap("polygon")
result.styles(["#000000"]).getMap("pointOnPolygon")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.pointsAlongLinesByQGIS

###### 述

Creates points at regular intervals along line or polygon geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>startOffset</td> <td>Double</td> <td>Distance from the beginning of the input line</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Distance between two consecutive points along the line</td> </tr> <tr> <td>endOffset</td> <td>Double</td> <td>Distance from the end of the input line</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates points at regular intervals along line or polygon geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[114.3,30.4],[114.4,30.5]]", "{a:10}", "EPSG:4326")
# 调用算子
a = service.getProcess("Feature.pointsAlongLinesByQGIS").execute(feature, 0, 1, 0)

feature.styles(["#000000"]).getMap("line")
a.styles(["#000000"]).getMap("pointOnLine")
oge.mapclient.centerMap(114.20,30.30,10)

```

##### Feature.randomPointsAlongLineByQGIS

###### 描述

Creates a new point layer, with points placed on the lines of another layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input line vector layer</td> </tr> <tr> <td>pointsNumber</td> <td>Int</td> <td>Number of points to create</td> </tr> <tr> <td>minDistance</td> <td>Double</td> <td>The minimum distance between points</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a new point layer, with points placed on the lines of another layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
line = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 调用算子
points = service.getProcess("Feature.randomPointsAlongLineByQGIS").execute(line, 2, 0)

line.styles(["#000000"]).getMap("line")
points.styles(["#000000"]).getMap("pointsOnLine")
oge.mapclient.centerMap(115.13,30.69,10)

```

##### Feature.randomPointsInLayerBoundsByQGIS

###### 描述

Creates a new point layer with a given number of random points, all of them within the extent of a given layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input polygon layer defining the area</td> </tr> <tr> <td>pointsNumber</td> <td>Int</td> <td>Number of points to create</td> </tr> <tr> <td>minDistance</td> <td>Double</td> <td>The minimum distance between points</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a new point layer with a given number of random points, all of them within the extent of a given layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建面要素
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 生成随机点
point = service.getProcess("Feature.randomPointsInLayerBoundsByQGIS").execute(feature, 5, 0)
# 可视化
feature .styles(["#000000"]).getMap("feature")
point.styles(["#000000"]).getMap("point")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.randomPointsInPolygonsByQGIS

###### 描述

Creates a point layer with points placed inside the polygons of another layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>minDistance</td> <td>Double</td> <td>The minimum distance between points within one polygon feature</td> </tr> <tr> <td>includePolygonAttributes</td> <td>String</td> <td>a point will get the attributes from the line</td> </tr> <tr> <td>maxTriesPerPoint</td> <td>Int</td> <td>The maximum number of tries per point</td> </tr> <tr> <td>pointsNumber</td> <td>Int</td> <td>Number of points to create</td> </tr> <tr> <td>minDistanceGlobal</td> <td>Double</td> <td>The global minimum distance between points</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a point layer with points placed inside the polygons of another layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
result = service.getProcess("Feature.randomPointsInPolygonsByQGIS").execute(feature,0,"True",10,5,0)
feature.styles(["#000000"]).getMap("feature")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.randomPointsOnLinesByQGIS

###### 描述

Creates a point layer with points placed on the lines of another layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>minDistance</td> <td>Double</td> <td>The minimum distance between points within one polygon feature</td> </tr> <tr> <td>includeLineAttributes</td> <td>String</td> <td>a point will get the attributes from the line</td> </tr> <tr> <td>maxTriesPerPoint</td> <td>Int</td> <td>The maximum number of tries per point</td> </tr> <tr> <td>pointsNumber</td> <td>Int</td> <td>Number of points to create</td> </tr> <tr> <td>minDistanceGlobal</td> <td>Double</td> <td>The global minimum distance between points</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a point layer with points placed on the lines of another layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.linearRing").execute("[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]", "{a:10}", "EPSG:4326")
result = service.getProcess("Feature.randomPointsOnLinesByQGIS").execute(feature,0,"True",10,1,0)
feature.styles(["#000000"]).getMap("feature")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.projectPointsByQGIS

###### 描述

Projects point geometries by a specified distance and bearing.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Distance to offset geometries, in layer units</td> </tr> <tr> <td>bearing</td> <td>Double</td> <td>Clockwise angle starting from North, in degree (°) unit</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Projects point geometries by a specified distance and bearing.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 构建点要素
point = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
# 构建线要素
line = service.getProcess("Feature.lineString").execute("[[114.09, 31],[114.3,31.5]]", "{a:10}", "EPSG:4326")
# 投影至笛卡尔坐标系
vector = service.getProcess("Feature.projectPointsByQGIS").execute(point, 1, 0)
# 可视化
vector.styles(["#000000"]).getMap("vector")
line.styles(["#FF0000"]).getMap("line")
oge.mapclient.centerMap(114.19,31.31,10)

```

#### 线要素

##### Feature.lineString

###### 描述

构造线要素，并指定坐标系，默认是EPSG：4326

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 可视化
feature.styles(["#FF0000"]).getMap("line")
oge.mapclient.centerMap(115.11,30.66,8)

```

##### Feature.multiLineString

###### 描述

构造多线要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("multiLineString")
oge.mapclient.centerMap(20,20,3)

```

#### 面要素

##### Feature.polygon

###### 描述

构造面要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.multiPolygon

###### 描述

构造多面要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.multiPolygon").execute("[[[[30, 20],[45, 40], [10, 40], [30, 20]]],[[[15, 5], [40, 10], [10, 20], [5, 10], [15, 5]]]]", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("multiPolygon")
oge.mapclient.centerMap(20,20,3)

```

#### 多边形

##### Feature.polygonizeByQGIS

###### 描述

Creates a polygon layer whose features boundaries are generated from a line layer of closed features.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>keepFields</td> <td>String</td> <td>Check to keep the field</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a polygon layer whose features boundaries are generated from a line layer of closed features.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.linearRing").execute("[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]", "{a:10}", "EPSG:4326")
polygon = service.getProcess("Feature.polygonizeByQGIS").execute(feature,"False")
polygon.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.rectanglesOvalsDiamondsByQGIS

###### 描述

Creates a buffer area with a rectangle, oval or diamond shape for each feature of the input point layer

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>rotation</td> <td>Double</td> <td>Rotation of the buffer shape.</td> </tr> <tr> <td>shape</td> <td>String</td> <td>The shape to use.</td> </tr> <tr> <td>segments</td> <td>Int</td> <td>Number of segments for a full circle (Ovals shape).</td> </tr> <tr> <td>width</td> <td>Double</td> <td>Width of the buffer shape.</td> </tr> <tr> <td>height</td> <td>Double</td> <td>Height of the buffer shape.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a buffer area with a rectangle, oval or diamond shape for each feature of the input point layer</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 创建点要素
point1 = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
point2 = service.getProcess("Feature.point").execute("[115.7, 30.3]", "{a:10}", "EPSG:4326")
point3 = service.getProcess("Feature.point").execute("[117.2, 30.3]", "{a:10}", "EPSG:4326")
# 生成矩形
rectangle = service.getProcess("Feature.rectanglesOvalsDiamondsByQGIS").execute(point1,0,"0",36,1,1)
# 生成菱形
diamond = service.getProcess("Feature.rectanglesOvalsDiamondsByQGIS").execute(point2,0,"1",36,1,1)
# 生成椭圆
oval = service.getProcess("Feature.rectanglesOvalsDiamondsByQGIS").execute(point3,0,"2",36,1,1)
# 可视化
rectangle.styles(["#000000"]).getMap("rectangle ")
diamond.styles(["#000000"]).getMap("diamond")
oval.styles(["#000000"]).getMap("oval")
oge.mapclient.centerMap(115.7,30.3,7)

```

#### 环要素

##### Feature.linearRing

###### 描述

构造环要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coors</td> <td>String</td> <td>Coordinates</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.linearRing").execute("[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]", "{a:10}", "EPSG:4326")
feature.styles(["#000000"]).getMap("linearRing")
oge.mapclient.centerMap(37,12,5)

```

#### 几何要素：

##### Feature.geometry

###### 描述

构造geometry，如果gjson中含有坐标系的话，会被设置的proj覆盖掉

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>gjson</td> <td>String</td> <td>geojson</td> </tr> <tr> <td>properties</td> <td>String</td> <td>Properties</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建GeoJSON
geojson="{'features':[{'geometry':{'coordinates':[[35,10],[35,15],[40,15],[40,10]],'type':'MultiPoint'},'type':'Feature','properties':{'osm_id':'27619437','a':'10'}}],'type':'FeatureCollection'}"
# 构建几何对象
feature = service.getProcess("Feature.geometry").execute(geojson,"EPSG:4326")
# 构建线要素
line = service.getProcess("Feature.lineString").execute("[[32,10],[44,10]]", "{num:10}", "EPSG:4326")
# 可视化
feature.styles(["#000000"]).getMap("point")
line.styles(["#000000"]).getMap("line")
oge.mapclient.centerMap(35.2,10.3,5)

```

#### 要素集

##### Feature.featureCollection

###### 描述

构造FeatureCollection对象

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureList</td> <td>List&lt;feature&gt;</td> <td>featureList</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.multiLineString").execute("[[[10, 10], [20, 20], [10, 40]], [[40, 40], [30, 30], [40, 20], [30, 10]]] ", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])

feature3.styles(["#000000"]).getMap("polygon3")
oge.mapclient.centerMap(37,12,5)

```

#### 要素加载

##### Feature.load

###### 描述

加载要素

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>productName</td> <td>String</td> <td>productName</td> </tr> <tr> <td>dateTime</td> <td>String</td> <td>dataTime</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.load").execute("China_MainRailway_Vector","null","EPSG:4326")
feature.styles(["#000000"]).getMap("China_MainRailway_Vector")
oge.mapclient.centerMap(114.2,30.3,5)

```

#### XY坐标

##### Feature.addXYFieldByQGIS

###### 描述

Adds X and Y (or latitude/longitude) fields to a point layer

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>crs</td> <td>String</td> <td>Coordinate reference system to use for the generated x and y fields.</td> </tr> <tr> <td>prefix</td> <td>String</td> <td>Prefix to add to the new field names to avoid name collisions with fields in the input layer.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Adds X and Y (or latitude/longitude) fields to a point layer</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建点要素
point = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
# 构建线要素
line = service.getProcess("Feature.lineString").execute("[[114.01, 30.39],[114.55,30.31]]", "{num:10}", "EPSG:4326")
# 添加XY字段
vector = service.getProcess("Feature.addXYFieldByQGIS").execute(point, "EPSG:4326", "default")
vector_property = service.getProcess("Feature.propertyNames").execute(vector)
# 可视化
vector_property.log("vector_property")
line.styles(["#000000"]).getMap("line")
vector.styles(["#000000"]).getMap("vector")

oge.mapclient.centerMap(114.2, 30.3,10)

```

##### Feature.swapXYByQGIS

###### 描述

Switches the X and Y coordinate values in input geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Switches the X and Y coordinate values in input geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
feature = service.getProcess("Feature.lineString").execute([[114.836,30.251],[114.854,30.324],[114.867,30.274],[114.875,30.316],
[114.888,30.246],[114.896,30.298],[114.917,30.321],[114.930,30.298],[114.914,30.246],[114.945,30.238],[114.961,30.313],[114.979,30.233]], 
"{a:10}", "EPSG:4326")
# 转换XY坐标
result = service.getProcess("Feature.swapXYByQGIS").execute(feature)
# 可视化
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(30.316,114.875,10)

```

#### XY转线

##### Feature.transectQGIS

###### 描述

Switches the X and Y coordinate values in input geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>side</td> <td>String</td> <td>Choose the side of the transect. Available options are</td> </tr> <tr> <td>length</td> <td>Double</td> <td>Length in map unit of the transect</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Change the angle of the transect</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Switches the X and Y coordinate values in input geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.lineString").execute([[114.836,30.251],[114.854,30.324],[114.867,30.274],[114.875,30.316],
[114.888,30.246],[114.896,30.298],[114.917,30.321],[114.930,30.298],[114.914,30.246],[114.945,30.238],[114.961,30.313],[114.979,30.233]], 
"{a:10}", "EPSG:4326")
result = service.getProcess("Feature.transectQGIS").execute(feature,"2",5,90)

result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.875,30.316,10)

```

#### 偏移

##### Feature.offsetLineByQGIS

###### 描述

Offsets lines by a specified distance

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>segments</td> <td>Int</td> <td>Controls the number of line segments to use to approximate a quarter circle</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Offset distance</td> </tr> <tr> <td>joinStyle</td> <td>String</td> <td>Specifies whether round, miter or beveled joins should be used when offsetting corners in a line</td> </tr> <tr> <td>miterLimit</td> <td>Double</td> <td>Controls the maximum distance from the offset curve</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Offsets lines by a specified distance</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 要素偏移
result = service.getProcess("Feature.offsetLineByQGIS").execute(feature, 8, 10, "0", 2)
# 可视化
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(111.28,39.57,10)

```

##### Feature.offsetCurveByGDAL

###### 描述

Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>The offset distance</td> </tr> <tr> <td>geometry</td> <td>String</td> <td>The name of the input layer geometry column to use</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the vector layer to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 生成线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.3],[115.9,31]]", "{a:10}", "EPSG:4326")
# 偏移曲线
result = service.getProcess("Feature.offsetCurveByGDAL").execute(feature, 1,"geometry", "default")
# 可视化
feature.styles(["#FF0000"]).getMap("feature")
result.styles(["#FF0000"]).getMap("result")
oge.mapclient.centerMap(114.98,31.15,6)

```

##### Feature.translateGeometryByQGIS

###### 描述

Moves the geometries within a layer, by offsetting with a predefined X and Y displacement.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>delta_x</td> <td>Double</td> <td>Displacement to apply on the X axis</td> </tr> <tr> <td>delta_y</td> <td>Double</td> <td>Displacement to apply on the Y axis</td> </tr> <tr> <td>delta_z</td> <td>Double</td> <td>Displacement to apply on the Z axis</td> </tr> <tr> <td>delta_m</td> <td>Double</td> <td>Displacement to apply on the Z axis</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Moves the geometries within a layer, by offsetting with a predefined X and Y displacement.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建多边形
feature = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 移动要素
result = service.getProcess("Feature.translateGeometryByQGIS").execute(feature,5,5,5,5)
# 可视化
feature.styles(["#FFFF00"]).getMap("feature")
result.styles(["#FFFF00"]).getMap("result")
oge.mapclient.centerMap(40,15,4)

```

##### Feature.arrayOffsetLinesByQGIS

###### 描述

Creates copies of line features in a layer

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>segments</td> <td>Double</td> <td>Number of line segments to use to approximate a quarter circle when creating rounded offsets</td> </tr> <tr> <td>joinStyle</td> <td>String</td> <td>Specify whether round, miter or beveled joins should be used when offsetting corners in a line</td> </tr> <tr> <td>offset</td> <td>Double</td> <td>Specify the output line layer with offset features</td> </tr> <tr> <td>count</td> <td>Double</td> <td>Number of offset copies to generate for each feature</td> </tr> <tr> <td>miterLimit</td> <td>Double</td> <td>Only applicable for mitered join styles</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates copies of line features in a layer</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
line = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 生成偏移对象
convexHull = service.getProcess("Feature.arrayOffsetLinesByQGIS").execute(line, 8, "1", 1, 10, 2)
# 可视化
convexHull.styles(["#FF0000"]).getMap("centroid")
oge.mapclient.centerMap(114.28,31.57,4)

```

##### Feature.pointsDisplacementByQGIS

###### 描述

Given a distance of proximity, identifies nearby point features and radially distributes them over a circle whose center represents their barycenter.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer</td> </tr> <tr> <td>proximity</td> <td>Double</td> <td>Distance below which point features are considered close. Close features are distributed altogether.</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Radius of the circle on which close features are placed</td> </tr> <tr> <td>horizontal</td> <td>String</td> <td>When only two points are identified as close, aligns them horizontally on the circle instead of vertically.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Given a distance of proximity, identifies nearby point features and radially distributes them over a circle whose center represents their barycenter.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建点要素
point1 = service.getProcess("Feature.point").execute("[35.1, 10.2]", "{a:10}", "EPSG:4326")
point2 = service.getProcess("Feature.point").execute("[35.2, 10.3]", "{a:10}", "EPSG:4326")
point3 = service.getProcess("Feature.point").execute("[35.4, 10.4]", "{a:10}", "EPSG:4326")
point4 = service.getProcess("Feature.point").execute("[35.2, 10.5]", "{a:10}", "EPSG:4326")
point5 = service.getProcess("Feature.point").execute("[35.3, 10.4]", "{a:10}", "EPSG:4326")
point6 = service.getProcess("Feature.point").execute("[35.2, 10.4]", "{a:10}", "EPSG:4326")
# 创建点要素集
points = service.getProcess("Feature.featureCollection").execute([point1, point2, point3, point4, point5, point6])
# 创建点要素集
line = service.getProcess("Feature.lineString").execute("[[35, 10],[35.3,10.5]]", "{a:10}", "EPSG:4326")
# 调用算子，将原本密集的点集分散在圆上
pointsDisplaced = service.getProcess("Feature.pointsDisplacementByQGIS").execute(points, 1, 1, "False")
# 可视化
points.styles(["#000000"]).getMap("points")
line.styles(["#FF0000"]).getMap("line")
pointsDisplaced.styles(["#000000"]).getMap("pointsDisplaced")
oge.mapclient.centerMap(37,12,5)

```

#### 转化

##### Feature.linesToPolygonsByQGIS

###### 描述

Generates a polygon layer using as polygon rings the lines from an input line layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input line vector layer</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Generates a polygon layer using as polygon rings the lines from an input line layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.9,31],[115.9,30.3]]", "{a:10}", "EPSG:4326")
# 调用算子
polygon = service.getProcess("Feature.linesToPolygonsByQGIS").execute(feature)

feature.styles(["#000000"]).getMap("line")
polygon.styles(["#000000"]).getMap("polygon")
oge.mapclient.centerMap(115.08,30.65,7)

```

##### Feature.polygonsToLinesByQGIS

###### 描述

Takes a polygon layer and creates a line layer

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Takes a polygon layer and creates a line layer</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
polygon = service.getProcess("Feature.polygon").execute("[[[114.2, 30.3],[115.9,30.3],[115.9,31.3],[114.2, 32.3],[114.2, 30.3]]]", "{a:10}", "EPSG:4326")
line = service.getProcess("Feature.polygonsToLinesByQGIS").execute(polygon)

polygon.styles(["#000000"]).getMap("polygon")
line.styles(["#000000"]).getMap("line")
oge.mapclient.centerMap(115.08,31.65,6)

```

#### 要素操作

##### Feature.rotateFeaturesByQGIS

###### 描述

Rotates feature geometries by the specified angle clockwise.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>anchor</td> <td>String</td> <td>X,Y coordinates of the point to rotate the features around</td> </tr> <tr> <td>angle</td> <td>Double</td> <td>Angle of the rotation in degrees</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Rotates feature geometries by the specified angle clockwise.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
line = service.getProcess("Feature.linearRing").execute("[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]", "{a:10}", "EPSG:4326")
# 旋转要素
result = service.getProcess("Feature.rotateFeaturesByQGIS").execute(line,"",45)
# 可视化
result.styles(["#FF0000"]).getMap("result")
oge.mapclient.centerMap(35.27,-17,4)

```

##### Feature.simplifyByQGIS

###### 描述

Simplifies the geometries in a line or polygon layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>method</td> <td>String</td> <td>Simplification method</td> </tr> <tr> <td>tolerance</td> <td>Double</td> <td>Threshold tolerance</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Simplifies the geometries in a line or polygon layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.lineString").execute([[114.836,30.251],[114.854,30.324],[114.867,30.274],[114.875,30.316],
[114.888,30.246],[114.896,30.298],[114.917,30.321],[114.930,30.298],[114.914,30.246],[114.945,30.238],[114.961,30.313],[114.979,30.233]], 
"{a:10}", "EPSG:4326")
result = service.getProcess("Feature.simplifyByQGIS").execute(feature,"0",0.001)

result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.875,30.316,10)

```

##### Feature.smoothByQGIS

###### 描述

Smooths the geometries in a line or polygon layer by adding more vertices and corners to the feature geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>maxAngle</td> <td>Double</td> <td>Every node below this value will be smoothed</td> </tr> <tr> <td>iterations</td> <td>Int</td> <td>Increasing the number of iterations will give smoother geometries</td> </tr> <tr> <td>offset</td> <td>Double</td> <td>Increasing values will move the smoothed lines</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Smooths the geometries in a line or polygon layer by adding more vertices and corners to the feature geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.lineString").execute([[114.836,30.251],[114.854,30.324],[114.867,30.274],[114.875,30.316],
[114.888,30.246],[114.896,30.298],[114.917,30.321],[114.930,30.298],[114.914,30.246],[114.945,30.238],[114.961,30.313],[114.979,30.233]], 
"{a:10}", "EPSG:4326")
result = service.getProcess("Feature.smoothByQGIS").execute(feature,180,5,0.25)

result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.875,30.316,10)

```

##### Feature.translatedFeaturesByQGIS

###### 描述

Applies an affine transformation to the layer geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>count</td> <td>Double</td> <td>Number of copies to generate for each feature</td> </tr> <tr> <td>deltaM</td> <td>Double</td> <td>Displacement to apply on the M axis.</td> </tr> <tr> <td>deltaX</td> <td>Double</td> <td>Displacement to apply on the X axis.</td> </tr> <tr> <td>deltaY</td> <td>Double</td> <td>Displacement to apply on the Y axis.</td> </tr> <tr> <td>deltaZ</td> <td>Double</td> <td>Displacement to apply on the Z axis.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Applies an affine transformation to the layer geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 转换要素
result = service.getProcess("Feature.translatedFeaturesByQGIS").execute(feature, 3, 1, 1, 1, 0)
# 可视化
feature.styles(["#FF0000"]).getMap("lineString")
result.styles(["#FF0000"]).getMap("result")
oge.mapclient.centerMap(115.28,32,5)

```

### 3.2.3 编辑工具

#### 重投影

##### Feature.reproject

###### 描述

重投影

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>tarCrsCode</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.multiPoint").execute("[[35, 10], [35, 15], [40, 15]]", "{a:10}", "EPSG:4326")
reproject = service.getProcess("Feature.reproject").execute(feature,"EPSG:3857")

feature.styles(["#000000"]).getMap("feature")
reproject.styles(["#000000"]).getMap("reproject")
oge.mapclient.centerMap(37,12,5)

```

#### 仿射变换

##### Feature.affineTransformByQGIS

###### 描述

Applies an affine transformation to the layer geometries.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>scaleX</td> <td>Double</td> <td>Scaling value (expansion or contraction) to apply on the X axis.</td> </tr> <tr> <td>scaleZ</td> <td>Double</td> <td>Scaling value (expansion or contraction) to apply on the Z axis.</td> </tr> <tr> <td>rotationZ</td> <td>Double</td> <td>Angle of the rotation in degrees.</td> </tr> <tr> <td>scaleY</td> <td>Double</td> <td>Scaling value (expansion or contraction) to apply on the Y axis.</td> </tr> <tr> <td>scaleM</td> <td>Double</td> <td>Scaling value (expansion or contraction) to apply on the M axis.</td> </tr> <tr> <td>deltaM</td> <td>Double</td> <td>Displacement to apply on the M axis.</td> </tr> <tr> <td>deltaX</td> <td>Double</td> <td>Displacement to apply on the X axis.</td> </tr> <tr> <td>deltaY</td> <td>Double</td> <td>Displacement to apply on the Y axis.</td> </tr> <tr> <td>deltaZ</td> <td>Double</td> <td>Displacement to apply on the Z axis.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Applies an affine transformation to the layer geometries.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
a = service.getProcess("Feature.affineTransformByQGIS").execute(feature, 1, 1, 0, 1, 1, 0, 0, 0, 0)

a.styles(["#000000"]).getMap("a")
oge.mapclient.centerMap(114.28,30.57,10)

```

#### 指定投影

##### Feature.assignProjectionByQGIS

###### 描述

Assigns a new projection to a vector layer

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>crs</td> <td>String</td> <td>Select the new CRS to assign to the vector layer</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Assigns a new projection to a vector layer</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:32649")
# 重投影
result = service.getProcess("Feature.assignProjectionByQGIS").execute(feature, "EPSG:4326")
# 可视化
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.28,30.57,10)

```

#### 在逆子午线分割测地线

##### Feature.antimeridianSplitByQGIS

###### 描述

Splits a line into multiple geodesic segments

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Splits a line into multiple geodesic segments</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
a = service.getProcess("Feature.antimeridianSplitByQGIS").execute(feature)

a.styles(["#000000"]).getMap("a")
oge.mapclient.centerMap(114.28,30.57,10)

```

#### 对齐

##### Feature.angleToNearestByQGIS

###### 描述

Calculates the rotation required to align point features with their nearest feature from another reference layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Point features to calculate the rotation for</td> </tr> <tr> <td>referenceLayer</td> <td>String</td> <td>Layer to find the closest feature from for rotation calculation</td> </tr> <tr> <td>maxDistance</td> <td>Double</td> <td>If no reference feature is found within this distance, no rotation is assigned to the point feature.</td> </tr> <tr> <td>fieldName</td> <td>String</td> <td>Field in which to store the rotation value.</td> </tr> <tr> <td>applySymbology</td> <td>String</td> <td>Rotates the symbol marker of the features using the angle field value</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Calculates the rotation required to align point features with their nearest feature from another reference layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建点要素
point = service.getProcess("Feature.point").execute("[114.2, 30.3]", "{a:10}", "EPSG:4326")
# 创建线要素
line = service.getProcess("Feature.lineString").execute("[[114.5, 30.6],[113.45,30.03]]", "{a:10}", "EPSG:4326")
# 对齐点到线要素
resultPoint = service.getProcess("Feature.angleToNearestByQGIS").execute(point, line, 10, "a", "rotation")

line.styles(["#FF0000"]).getMap("line")
resultPoint.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.2, 30.3,9)

```

#### 融合

##### Feature.dissolveByGDAL

###### 描述

Dissolve (combine) geometries that have the same value for a given attribute / field. The output geometries are multipart.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The input layer to dissolve</td> </tr> <tr> <td>explodeCollections</td> <td>String</td> <td>Produce one feature for each geometry in any kind of geometry collection in the source file</td> </tr> <tr> <td>field</td> <td>String</td> <td>The field of the input layer to use for dissolving</td> </tr> <tr> <td>computeArea</td> <td>String</td> <td>Compute the area and perimeter of dissolved features and include them in the output layer</td> </tr> <tr> <td>keepAttributes</td> <td>String</td> <td>Keep all attributes from the input layer</td> </tr> <tr> <td>computeStatistics</td> <td>String</td> <td>Calculate statistics (min, max, sum and mean) for the numeric attribute specified and include them in the output layer</td> </tr> <tr> <td>countFeatures</td> <td>String</td> <td>Count the dissolved features and include it in the output layer.</td> </tr> <tr> <td>statisticsAttribute</td> <td>String</td> <td>The numeric attribute to calculate statistics on</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL creation options.</td> </tr> <tr> <td>geometry</td> <td>String</td> <td>The name of the input layer geometry column to use for dissolving.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Dissolve (combine) geometries that have the same value for a given attribute / field. The output geometries are multipart.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 生成面要素
polygon = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
# 融合
result = service.getProcess("Feature.dissolveByGDAL").execute(polygon, "false", "default", "false", "false", "false", "false", "default", "default", "geometry")
# 可视化
polygon.styles(["#000000"]).getMap("polygon")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(37,12,5)

```

#### 栅格采样

##### Feature.rasterSamplingByQGIS

###### 描述

Extracts raster values at the point locations. If the raster layer is multiband, each band is sampled.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Point vector layer to use for sampling.</td> </tr> <tr> <td>rasterCopy</td> <td>Coverage</td> <td>Raster layer to sample at the given point locations.</td> </tr> <tr> <td>columnPrefix</td> <td>String</td> <td>Prefix for the names of the added columns.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Extracts raster values at the point locations. If the raster layer is multiband, each band is sampled.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
oge.initialize()
service = oge.Service()
coverage = service.getCoverage(
    coverageID="LC81230392016205LGN00", productID="LC08_L1T")
coverage = service.getProcess("Coverage.selectBands").execute(coverage,["B1"])

feature1 = service.getProcess("Feature.point").execute("[113.72,30.28]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.point").execute("[114.01,30.41]", "{a:10}", "EPSG:4326")
feature3 = service.getProcess("Feature.featureCollection").execute([feature1,feature2])
rs = service.getProcess("Feature.rasterSamplingByQGIS").execute(feature3,coverage,"ss")
vis_params = {"min": 0, "max": 10000}
coverage.styles(vis_params).getMap("coverage")
rs.styles(["#000000"]).getMap("multiPoint")
oge.mapclient.centerMap(113.836, 30.298, 8)

```

#### 德洛内三角网

##### Feature.delaunayTriangulationByQGIS

###### 描述

Creates a polygon layer with the Delaunay triangulation corresponding to the input point layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates a polygon layer with the Delaunay triangulation corresponding to the input point layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 加载商场POI
market = service.getProcess("Feature.load").execute("HC_Market_Case","null","EPSG:4326")
# 生成三角网
result = service.getProcess("Feature.delaunayTriangulationByQGIS").execute(market)
# 可视化
result.styles(["#FFFF00"]).getMap("result")
oge.mapclient.centerMap(114.32,30.54,13)

```

### 3.2.4 叠加分析工具

#### 并集

##### Feature.dissolve

###### 描述

返回geometry的并集，单个geometry不变，多个geometry求并集

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
dissolve = service.getProcess("Feature.dissolve").execute(feature1,"EPSG:4326")
dissolve.styles(["#111111"]).getMap("dissolve")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.union

###### 描述

并集

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.polygon").execute("[[[38, 10], [38, 15], [43, 15], [43, 10], [38, 10]]]", "{a:10}", "EPSG:4326")
union = service.getProcess("Feature.union").execute(feature1,feature2,"EPSG:4326")
union.styles(["#111111"]).getMap("union")
oge.mapclient.centerMap(37,12,5)

```

#### 交集

##### Feature.intersection

###### 描述

交集

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.polygon").execute("[[[38, 10], [38, 15], [43, 15], [43, 10], [38, 10]]]", "{a:10}", "EPSG:4326")
intersection = service.getProcess("Feature.intersection").execute(feature1,feature2,"EPSG:4326")
intersection.styles(["#111111"]).getMap("intersection")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.symmetricDifference

###### 描述

对称差（交集取反）

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.polygon").execute("[[[38, 10], [38, 15], [43, 15], [43, 10], [38, 10]]]", "{a:10}", "EPSG:4326")
symmetricDifference = service.getProcess("Feature.symmetricDifference").execute(feature1,feature2,"EPSG:4326")
symmetricDifference.styles(["#111111"]).getMap("symmetricDifference")
oge.mapclient.centerMap(37,12,5)

```

#### 差集

##### Feature.difference

###### 描述

差集（left-right）

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.polygon").execute("[[[38, 10], [38, 15], [43, 15], [43, 10], [38, 10]]]", "{a:10}", "EPSG:4326")
difference = service.getProcess("Feature.difference").execute(feature1,feature2,"EPSG:4326")
difference.styles(["#111111"]).getMap("difference")
oge.mapclient.centerMap(37,12,5)

```

#### 包含

##### Feature.containedIn

###### 描述

被包含关系（left被包含在right中）

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Boolean</td> <td>Boolean</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getFeature(featureId="China_MainRoad_Vector")
feature2 = service.getFeature(featureId="China_ADM_Country_Vector")
containedIn= service.getProcess("Feature.containedIn").execute(feature1,feature2,"EPSG:4326")
containedIn.log("containedIn")

feature1.styles(["#000000"]).getMap("China_MainRoad_Vector")
feature2.styles(["#000000"]).getMap("China_ADM_Country_Vector")
oge.mapclient.centerMap(114.4,30.5,4)

```

##### Feature.contains

###### 描述

包含关系（left包含right）

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Boolean</td> <td>Boolean</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getFeature(featureId="China_MainRoad_Vector")
feature2 = service.getFeature(featureId="China_ADM_Country_Vector")
contains = service.getProcess("Feature.contains").execute(feature1,feature2,"EPSG:4326")
contains.log("iscontains")

feature1.styles(["#000000"]).getMap("China_MainRoad_Vector")
feature2.styles(["#000000"]).getMap("China_ADM_Country_Vector")
oge.mapclient.centerMap(114.4,30.5,4)

```

#### 相交

##### Feature.intersects

###### 描述

相交关系判断

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Boolean</td> <td>Boolean</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getFeature(featureId="China_MainRoad_Vector")
feature2 = service.getFeature(featureId="WHU_Road_Vector")
intersects = service.getProcess("Feature.intersects").execute(feature1,feature2,"EPSG:4326")
intersects.log("intersects")

feature1.styles(["#000000"]).getMap("China_MainRoad_Vector")
feature2.styles(["#000000"]).getMap("WHU_Road_Vector")
oge.mapclient.centerMap(114.4,30.5,12)

```

#### 相离

##### Feature.disjoint

###### 描述

相离关系

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Boolean</td> <td>Boolean</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getFeature(featureId="China_MainRoad_Vector")
feature2 = service.getFeature(featureId="WHU_Road_Vector")
disjoint = service.getProcess("Feature.disjoint").execute(feature1,feature2,"EPSG:4326")

disjoint.log("disjoint")
feature1.styles(["#000000"]).getMap("China_MainRoad_Vector")
feature2.styles(["#000000"]).getMap("WHU_Road_Vector")

oge.mapclient.centerMap(114.4,30.5,12)

```

### 3.2.5 邻近分析工具

#### 创建泰森多边形

##### Feature.voronoiPolygonsByQGIS

###### 描述

Takes a point layer and generates a polygon layer containing the Voronoi polygons corresponding to those input points.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>buffer</td> <td>Double</td> <td>The extent of the output layer will be this much bigger than the extent of the input layer.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Takes a point layer and generates a polygon layer containing the Voronoi polygons corresponding to those input points.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 加载商场POI
market = service.getProcess("Feature.load").execute("HC_Market_Case","null","EPSG:4326")
# 生成泰森多边形
result = service.getProcess("Feature.voronoiPolygonsByQGIS").execute(market,0)
# 可视化
result.styles(["#FFFF00"]).getMap("result")
oge.mapclient.centerMap(114.32,30.54,13)

```

#### 缓冲

##### Feature.buffer

###### 描述

缓冲区建立

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>distance</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature= service.getFeature(featureId="China_MainRoad_Vector")
buffer= service.getProcess("Feature.buffer").execute(feature,0.5,"EPSG:4326")

feature.styles(["#000000"]).getMap("China_MainRoad_Vector")
buffer.styles(["#000000"]).getMap("buffer")

oge.mapclient.centerMap(114.4,30.5,5)

```

##### Feature.oneSideBufferByGDAL

###### 描述

Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>The distance</td> </tr> <tr> <td>explodeCollections</td> <td>String</td> <td></td> </tr> <tr> <td>field</td> <td>String</td> <td>Field to use for dissolving</td> </tr> <tr> <td>bufferSide</td> <td>String</td> <td>0: Right, 1: Left</td> </tr> <tr> <td>dissolve</td> <td>String</td> <td>If set, the result is dissolved. If no field is set for dissolving</td> </tr> <tr> <td>geometry</td> <td>String</td> <td>The name of the input layer geometry column to use</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the vector layer to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 生成线要素
line = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 创建单边矢量缓冲区
result = service.getProcess("Feature.oneSideBufferByGDAL").execute(line, 1, "False", "default", "0", "False", "geometry", "default")
# 可视化
line.styles(["#FF0000"]).getMap("line")
result.styles(["#FFFF00"]).getMap("result")
oge.mapclient.centerMap(114.77,30.57,6)

```

##### Feature.singleSidedBufferByQGIS

###### 描述

Computes a buffer on lines by a specified distance on one side of the line only.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input line vector layer.</td> </tr> <tr> <td>side</td> <td>String</td> <td>Which side to create the buffer on.</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Buffer distance.</td> </tr> <tr> <td>segments</td> <td>Int</td> <td>Controls the number of line segments to use to approximate a quarter circle when creating rounded offsets.</td> </tr> <tr> <td>joinStyle</td> <td>String</td> <td>Options are: 0 --- Round 1 --- Miter 2 --- Bevel.</td> </tr> <tr> <td>miterLimit</td> <td>Double</td> <td>Sets the maximum distance from the offset geometry to use when creating a mitered join as a factor of the offset distance.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Computes a buffer on lines by a specified distance on one side of the line only.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 构建线要素
line = service.getProcess("Feature.lineString").execute([[114.2,30.3],[115.4,30.8],[115.9,31]], "a:b", "EPSG:4326")
# 生成缓冲区
buffers = service.getProcess("Feature.singleSidedBufferByQGIS").execute(line,"0",1,8,"0",2)
# 可视化
buffers.styles(["#000000"]).getMap("buffers ")
oge.mapclient.centerMap(114.86, 31.07, 6)

```

##### Feature.taperedBufferByQGIS

###### 描述

Creates tapered buffer along line geometries, using a specified start and end buffer diameter.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input line vector layer.</td> </tr> <tr> <td>segments</td> <td>Int</td> <td>Controls the number of line segments to use to approximate a quarter circle when creating rounded offsets.</td> </tr> <tr> <td>startWidth</td> <td>Double</td> <td>Represents the radius of the buffer applied at the start point of the line feature.</td> </tr> <tr> <td>ednWidth</td> <td>Double</td> <td>Represents the radius of the buffer applied at the end point of the line feature.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates tapered buffer along line geometries, using a specified start and end buffer diameter.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service.initialize()

line = service.getProcess("Feature.lineString").execute([[114.2,30.3],[115.4,30.8]], "a:b", "EPSG:4326")
buffers = service.getProcess("Feature.taperedBufferByQGIS").execute(line,16,0,0.1)
# 可视化
line.styles(["#000000"]).getMap("line")
buffers.styles(["#000000"]).getMap("buffers")
oge.mapclient.centerMap(114.28, 30.57, 8)

```

##### Feature.wedgeBuffersByQGIS

###### 描述

Creates wedge shaped buffers from input points.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input point vector layer.</td> </tr> <tr> <td>innerRadius</td> <td>Double</td> <td>Inner radius value. If 0 the wedge will begin from the source point.</td> </tr> <tr> <td>outerRadius</td> <td>Double</td> <td>The outer size (length) of the wedge: the size is meant from the source point to the edge of the wedge shape.</td> </tr> <tr> <td>width</td> <td>Double</td> <td>Width (in degrees) of the buffer.</td> </tr> <tr> <td>azimuth</td> <td>Double</td> <td>Angle (in degrees) as the middle value of the wedge.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Creates wedge shaped buffers from input points.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature = service.getProcess("Feature.multiPoint").execute("[[35, 10], [35, 15], [40, 15], [40, 10]]", "{a:10}", "EPSG:4326")
bufferResult = service.getProcess("Feature.wedgeBuffersByQGIS").execute(feature,0,1,45,0)
bufferResult.styles(["#000000"]).getMap("bufferResult")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.bufferVectorsByGDAL

###### 描述

Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>The distance</td> </tr> <tr> <td>explodeCollections</td> <td>String</td> <td></td> </tr> <tr> <td>field</td> <td>String</td> <td>Field to use for dissolving</td> </tr> <tr> <td>dissolve</td> <td>String</td> <td>If set, the result is dissolved. If no field is set for dissolving</td> </tr> <tr> <td>geometry</td> <td>String</td> <td>The name of the input layer geometry column to use</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the vector layer to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Offsets lines by a specified distance. Positive distances will offset lines to the left, and negative distances will offset them to the right.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 生成线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 创建矢量缓冲区
result = service.getProcess("Feature.bufferVectorsByGDAL").execute(feature, 0.01, "False", "default", "False", "geometry", "default")
# 可视化
feature.styles(["#111111"]).getMap("feature")
result.styles(["#000000"]).getMap("result")
oge.mapclient.centerMap(114.28,30.57,10)

```

#### 多环缓冲

##### Feature.multiRingConstantBufferByQGIS

###### 描述

Computes multi-ring (donut) buffer for the features of the input layer, using a fixed or dynamic distance and number of rings.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>Input vector layer</td> </tr> <tr> <td>rings</td> <td>Int</td> <td>The number of rings. It can be a unique value (same number of rings for all the features) or it can be taken from features data (the number of rings depends on feature values).</td> </tr> <tr> <td>distance</td> <td>Double</td> <td>Distance between the rings. It can be a unique value (same distance for all the features) or it can be taken from features data (the distance depends on feature values).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Computes multi-ring (donut) buffer for the features of the input layer, using a fixed or dynamic distance and number of rings.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
# 生成线
line = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 生成多环缓冲区
bufferResult = service.getProcess("Feature.multiRingConstantBufferByQGIS").execute(line,3,0.1)
# 可视化
bufferResult .styles(["#000000"]).getMap("bufferResult ")
oge.mapclient.centerMap(114.28,30.57,7)

```

#### 距离

##### Feature.distance

###### 描述

返回两个geometry之间的最短距离

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD1</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>featureRDD2</td> <td>Feature</td> <td>feature</td> </tr> <tr> <td>crs</td> <td>String</td> <td>CRS</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Double</td> <td>Double</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()
feature1 = service.getProcess("Feature.polygon").execute("[[[35, 10], [35, 15], [40, 15], [40, 10], [35, 10]]]", "{a:10}", "EPSG:4326")
feature2 = service.getProcess("Feature.polygon").execute("[[[45, 10], [45, 15], [50, 15], [50, 10], [45, 10]]]", "{a:10}", "EPSG:4326")
distance = service.getProcess("Feature.distance").execute(feature1,feature2,"EPSG:4326")
distance.log("distance")
feature1.styles(["#000000"]).getMap("polygon1")
feature2.styles(["#000000"]).getMap("polygon2")
oge.mapclient.centerMap(37,12,5)

```

##### Feature.shortestPathPointToPointByQGIS

###### 描述

Computes the optimal (shortest or fastest) route between a given start point and a given end point.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The feature as the input data</td> </tr> <tr> <td>valueForward</td> <td>String</td> <td>Value set in the direction field to identify edges with a forward direction</td> </tr> <tr> <td>valueBoth</td> <td>String</td> <td>Value set in the direction field to identify bidirectional edges</td> </tr> <tr> <td>startPoint</td> <td>String</td> <td>Point feature representing the start point of the routes</td> </tr> <tr> <td>defaultDirection</td> <td>String</td> <td>If a feature has no value set in the direction field or if no direction field is set, then this direction value is used. One of: 0 — Forward direction 1 — Backward direction 2 — Both directions</td> </tr> <tr> <td>strategy</td> <td>String</td> <td>The type of path to calculate. One of: 0 — Shortest 1 — Fastest</td> </tr> <tr> <td>tolerance</td> <td>Double</td> <td>Two lines with nodes closer than the specified tolerance are considered connected</td> </tr> <tr> <td>defaultSpeed</td> <td>Double</td> <td>Value to use to calculate the travel time if no speed field is provided for an edge</td> </tr> <tr> <td>directionField</td> <td>String</td> <td>The field used to specify directions for the network edges.</td> </tr> <tr> <td>endPoint</td> <td>String</td> <td>Point feature representing the end point of the routes.</td> </tr> <tr> <td>valueBackward</td> <td>String</td> <td>Value set in the direction field to identify edges with a backward direction.</td> </tr> <tr> <td>speedField</td> <td>String</td> <td>Field providing the speed value (in ) for the edges of the network when looking for the fastest path.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Computes the optimal (shortest or fastest) route between a given start point and a given end point.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service.initialize()

# 读取道路数据
streets = service.getProcess("Feature.load").execute("HC_MainStreets_Case","null","EPSG:4326")
# 选取起点与终点
start = service.getProcess("Feature.point").execute("[114.337475, 30.558570]", "{a:10}", "EPSG:4326")
end = service.getProcess("Feature.point").execute("[114.328842,30.542172]", "{a:10}", "EPSG:4326")
# 最短路径分析
shortestPath = service.getProcess("Feature.shortestPathPointToPointByQGIS").execute(streets, "", "", "114.337475,30.558570 [EPSG:4326]", "2", "0", 0.0, 50.0, "", "114.328842,30.542172 [EPSG:4326]", "", "")
# 可视化
start.styles(["#000000"]).getMap("startPoint")  
end.styles(["#000000"]).getMap("endPoint")
shortestPath.styles(["#000000"]).getMap("shortestPath")
oge.mapclient.centerMap(114.32,30.54,12)

```

### 3.2.6 提取分析工具

#### 裁剪

##### Feature.clipVectorByExtentByGDAL

###### 描述

Clips any OGR-supported vector file to a given extent.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The input vector file</td> </tr> <tr> <td>extent</td> <td>String</td> <td>Defines the bounding box that should be used for the output vector file. It has to be defined in target CRS coordinates.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Clips any OGR-supported vector file to a given extent.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 创建裁剪范围
extent = "114.500000000,115.500000000,30.079452055,31.220547945"
# 调用算子
a = service.getProcess("Feature.clipVectorByExtentByGDAL").execute(feature, extent, "")
# 显示裁剪后的线要素
a.styles(["#000000"]).getMap("a")
oge.mapclient.centerMap(114.28,30.57,10)

```

##### Feature.clipVectorByPolygonByGDAL

###### 描述

Clips any OGR-supported vector layer by a mask polygon layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Feature</td> <td>The input vector file</td> </tr> <tr> <td>mask</td> <td>String</td> <td>Layer to be used as clipping extent for the input vector layer.</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL creation options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Clips any OGR-supported vector layer by a mask polygon layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service.initialize()

# 创建线要素
feature = service.getProcess("Feature.lineString").execute("[[114.2, 30.3],[115.4,30.8],[115.9,31]]", "{a:10}", "EPSG:4326")
# 创建用于裁剪的多边形
extent = service.getProcess("Feature.polygon").execute("[[[115.0, 30.3], [115.5, 30.3], [115.5, 31], [115.0, 31], [115.0, 30.3]]]", "{a:10}", "EPSG:4326")
# 调用算子
clip = service.getProcess("Feature.clipVectorByPolygonByGDAL").execute(feature, extent, "")
# 显示裁剪后的线要素
clip.styles(["#000000"]).getMap("clip")
oge.mapclient.centerMap(115.28,30.74,10)

```

## 3.3 空间分析

### 3.3.1 DEM分析工具

#### 梯度

##### Coverage.gradient

###### 描述

Calculates the gradient.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the gradient.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the gradient.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

ls8 = service.getCoverage(

    coverageID="LC81220392015275LGN00", productID="LC08_L1T")

b2 = service.getProcess("Coverage.selectBands").execute(ls8, ["B2"])

gradient = service.getProcess("Coverage.gradient").execute(b2)

vis_params = {"min": -100, "max": 100,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

gradient.styles(vis_params).getMap("gradient")

oge.mapclient.centerMap(114.30, 30.608, 10)

```

#### 坡向

##### Coverage.aspect

###### 描述

坡向计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>the input coverage</td> </tr> <tr> <td>Z_factor</td> <td>Float</td> <td>Vertical exaggeration</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N36E120", productID="ASTER_GDEM_DEM30")
aspect = service.getProcess("Coverage.aspect").execute(dem, 1)

vis_params = {"palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
aspect.styles(vis_params).getMap("aspect")
oge.mapclient.centerMap(120, 36, 11)

```

##### Coverage.aspectByQGIS

###### 描述

Calculates the aspect of the Digital Terrain Model in input.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Digital Terrain Model raster layer.</td> </tr> <tr> <td>zFactor</td> <td>Double</td> <td>Vertical exaggeration.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the aspect of the Digital Terrain Model in input.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.aspectByQGIS").execute(

    dem, 1.0)

vis_params = {"min": 0, "max": 360,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.aspectByGDAL

###### 描述

Generates an aspect map from any GDAL-supported elevation raster.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>The number of the band to use as elevation.</td> </tr> <tr> <td>trigAngle</td> <td>String</td> <td>Activating the trigonometric angle results in different categories: 0° (East), 90° (North), 180° (West), 270° (South).</td> </tr> <tr> <td>zeroFlat</td> <td>String</td> <td>Activating this option will insert a 0-value for the value -9999 on flat areas.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>zevenbergen</td> <td>String</td> <td>Activates Zevenbergen&Thorne formula for smooth landscapes.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Generates an aspect map from any GDAL-supported elevation raster.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.aspectByGDAL").execute(
    dem, 1, "False", "False", "False", "False", "")
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

###### 描述

Generates an aspect map from any GDAL-supported elevation raster.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>The coverage to which the operation is applied.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>The number of the band to use as elevation.</td> </tr> <tr> <td>trigAngle</td> <td>String</td> <td>Activating the trigonometric angle results in different categories: 0° (East), 90° (North), 180° (West), 270° (South).</td> </tr> <tr> <td>zeroFlat</td> <td>String</td> <td>Activating this option will insert a 0-value for the value -9999 on flat areas.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>zevenbergen</td> <td>String</td> <td>Activates Zevenbergen&Thorne formula for smooth landscapes.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Generates an aspect map from any GDAL-supported elevation raster.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.aspectByGDAL").execute(
    dem, 1, "False", "False", "False", "False", "")
vis_params = {"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrAspect

###### 描述

根据输入的DEM计算坡向

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the aspect.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the aspect, 1 for a 3x3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct aspect calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrAspect").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 坡度

##### Coverage.slope

###### 描述

坡度计算

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>the input coverage</td> </tr> <tr> <td>Z_factor</td> <td>Float</td> <td>Vertical exaggeration</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.slope").execute(dem, 1.0, 1.0)

vis_params = {

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.slopeByQGIS

###### 描述

Calculates the slope from an input raster layer.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Digital Terrain Model raster layer.</td> </tr> <tr> <td>zFactor</td> <td>Double</td> <td>Vertical exaggeration.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the slope from an input raster layer.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.slopeByQGIS").execute(dem, 1.0)

vis_params = {"min": -1, "max": 1,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.slopeByGDAL

###### 描述

Generates a slope map from any GDAL-supported elevation raster.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>band</td> <td>Int</td> <td>Band containing the elevation information.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>asPercent</td> <td>String</td> <td>Express slope as percent instead of degrees.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Additional GDAL command line options.</td> </tr> <tr> <td>scale</td> <td>Double</td> <td>The ratio of vertical units to horizontal units.</td> </tr> <tr> <td>zevenbergen</td> <td>String</td> <td>Activates Zevenbergen&Thorne formula for smooth landscapes</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL command line options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Generates a slope map from any GDAL-supported elevation raster.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.slopeByGDAL").execute(

    dem, 1,"False","False","",1.0,"False","")

vis_params = {"min": -1, "max": 1,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrSlope

###### 描述

根据输入的DEM计算坡度

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the slope.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the slope, 1 for a 3x3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct slope calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrSlope").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 坡长

##### Coverage.terrSlopelength

###### 描述

根据输入的DEM计算坡长

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the slopelength.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>radius for DEM indexing, default is 16</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct slopelength calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrSlopelength").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 曲率

##### Coverage.terrCurvature

###### 描述

根据输入的DEM计算曲率

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the curvature.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the curvature, 1 for a 3x3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct curvature calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrCurvature").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 等值线

##### Coverage.contourByGDAL

###### 描述

Extracts contour lines from any GDAL-supported elevation raster.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster.</td> </tr> <tr> <td>interval</td> <td>Double</td> <td>Defines the interval between the contour lines in the given units of the elevation raster (minimum value 0).</td> </tr> <tr> <td>ignoreNodata</td> <td>String</td> <td>Ignores any nodata values in the dataset.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options. Refer to the corresponding GDAL utility documentation.</td> </tr> <tr> <td>create3D</td> <td>String</td> <td>Forces production of 3D vectors instead of 2D. Includes elevation at every vertex.</td> </tr> <tr> <td>nodata</td> <td>String</td> <td>Defines a value that should be inserted for the nodata values in the output raster.</td> </tr> <tr> <td>offset</td> <td>Double</td> <td></td> </tr> <tr> <td>band</td> <td>Int</td> <td>Raster band to create the contours from.</td> </tr> <tr> <td>fieldName</td> <td>String</td> <td>Provides a name for the attribute in which to put the elevation.</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL creation options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Extracts contour lines from any GDAL-supported elevation raster.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()
# 加载数据
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
# 生成等高线
contour = service.getProcess("Coverage.contourByGDAL").execute(
    dem,30.0,'false',"","false","0",0,1,"ELEV","")
# 可视化
contour.styles("#FF0000").getMap("contour")

oge.mapclient.centerMap(56.25, 28.40, 12)

```

##### Coverage.contourPolygonByGDAL

###### 描述

Extracts contour polygons from any GDAL-supported elevation raster.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster.</td> </tr> <tr> <td>interval</td> <td>Double</td> <td>Defines the interval between the contour lines in the given units of the elevation raster (minimum value 0).</td> </tr> <tr> <td>ignoreNodata</td> <td>String</td> <td>Ignores any nodata values in the dataset.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options. Refer to the corresponding GDAL utility documentation.</td> </tr> <tr> <td>create3D</td> <td>String</td> <td>Forces production of 3D vectors instead of 2D. Includes elevation at every vertex.</td> </tr> <tr> <td>nodata</td> <td>String</td> <td>Defines a value that should be inserted for the nodata values in the output raster.</td> </tr> <tr> <td>offset</td> <td>Double</td> <td>Defines an offset from the base contour elevation for the first contour.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>Raster band to create the contours from.</td> </tr> <tr> <td>fieldNameMax</td> <td>String</td> <td>Provides a name for the attribute in which to put the maximum elevation of contour polygon. If not provided no maximum elevation attribute is attached.</td> </tr> <tr> <td>fieldNameMin</td> <td>String</td> <td>Provides a name for the attribute in which to put the minimum elevation of contour polygon. If not provided no minimum elevation attribute is attached.</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL creation options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>Extracts contour polygons from any GDAL-supported elevation raster.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge
# 初始化
oge.initialize()
service = oge.Service()
# 加载数据
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")
# 生成等高线
contour = service.getProcess("Coverage.contourPolygonByGDAL").execute(
    dem, 40.0,"false","","false",0,0,1,"ELEV_MAX","ELEV_MIN","")
# 可视化
contour.styles("#FFFF00").getMap("contour")
oge.mapclient.centerMap(56.25, 28.40, 12)

```

#### 山体阴影

##### Coverage.hillShadeByGDAL

###### 描述

Outputs a raster with a nice shaded relief effect. It’s very useful for visualizing the terrain.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>combined</td> <td>String</td> <td></td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>extra</td> <td>String</td> <td>Add extra GDAL command line options.</td> </tr> <tr> <td>band</td> <td>Int</td> <td>Band containing the elevation information.</td> </tr> <tr> <td>altitude</td> <td>Double</td> <td>Defines the altitude of the light, in degrees. 90 if the light comes from above the elevation raster, 0 if it is raking light.</td> </tr> <tr> <td>zevenbergenThorne</td> <td>String</td> <td>Activates Zevenbergen&Thorne formula for smooth landscapes.</td> </tr> <tr> <td>zFactor</td> <td>Double</td> <td>The factor exaggerates the height of the output elevation raster.</td> </tr> <tr> <td>multidirectional</td> <td>String</td> <td></td> </tr> <tr> <td>scale</td> <td>Double</td> <td>The ratio of vertical units to horizontal units.</td> </tr> <tr> <td>azimuth</td> <td>Double</td> <td>Defines the azimuth of the light shining on the elevation raster in degrees. If it comes from the top of the raster the value is 0, if it comes from the east it is 90 a.s.o.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Outputs a raster with a nice shaded relief effect. It’s very useful for visualizing the terrain.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.hillShadeByGDAL").execute(

    dem, "False","False","",1,45.0,"False",1.0,"False",1.0,315.0,"")

vis_params = {"min": -1, "max": 1,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrHillshade

###### 描述

根据输入的DEM计算山体阴影

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the hillside.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the hillside, 1 for a 3x3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct hillside calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrHillshade").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 粗糙度

##### Coverage.terrRuggedness

###### 描述

根据输入的DEM计算粗糙度

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the ruggedness.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the ruggedness, 1 for a 3x3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct ruggedness calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

aspect = service.getProcess("Coverage.terrRuggedness").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

aspect.styles(vis_params).getMap("aspect")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.ruggednessIndexByQGIS

###### 描述

Calculates the quantitative measurement of terrain heterogeneity .

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input raster layer.</td> </tr> <tr> <td>zFactor</td> <td>Double</td> <td>Vertical exaggeration.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Calculates the quantitative measurement of terrain heterogeneity .</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.ruggednessIndexByQGIS").execute(dem, 0.4)

vis_params = {"min": -1, "max": 1,

              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")

dem.styles(vis_params).getMap("dem")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.roughnessByGDAL

###### 描述

Outputs a single-band raster with values computed from the elevation.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>band</td> <td>Int</td> <td>Band containing the elevation information.</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Outputs a single-band raster with values computed from the elevation.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.roughnessByGDAL").execute(
    dem,1,"False","")
vis_params = {"min": -100, "max": 100}

a.styles(vis_params).getMap("a")

oge.mapclient.centerMap(56.25, 28.40, 10)

```

#### 洼地

##### Coverage.terrPitrouter

###### 描述

根据输入的DEM进行洼地探测

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the pitrouter.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the pitrouter, 1 for a 3×3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct pitrouter calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

pitrouter = service.getProcess("Coverage.terrPitrouter").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

pitrouter.styles(vis_params).getMap("pitrouter")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrPiteliminator

###### 描述

根据输入的DEM进行洼地填充

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the piteliminator.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the piteliminator, 1 for a 3×3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct piteliminator calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

piteliminator = service.getProcess("Coverage.terrPiteliminator").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

piteliminator.styles(vis_params).getMap("piteliminator")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 水文

##### Coverage.terrFlowdirection

###### 描述

根据输入的DEM计算流向

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The coverage to compute the flowdirection.</td> </tr> <tr> <td>radius</td> <td>Int</td> <td>The radius of the square neighborhood to compute the flowdirection, 1 for a 3×3 square.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct flowdirection calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

flowdirection = service.getProcess("Coverage.terrFlowdirection").execute(dem, 1,1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

flowdirection.styles(vis_params).getMap("flowdirection")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrFlowaccumulation

###### 描述

根据输入的DEM计算流量

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> <td>The dem coverage to compute the flowaccumulation.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct flowaccumulation calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

flowaccumulation = service.getProcess("Coverage.terrFlowaccumulation").execute(dem, 1)

vis_params = {"min": -1, "max": 1, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}

flowaccumulation.styles(vis_params).getMap("flowaccumulation")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.terrChannelnetwork

###### 描述

根据输入的DEM，流量，流向数据进行河流网的矢量化

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>DEM</td> <td>Coverage</td> <td>The dem coverage to compute the channelnetwork.</td> </tr> <tr> <td>FlowAccumulation</td> <td>Coverage</td> <td>The flowaccumulation coverage to compute the channelnetwork.</td> </tr> <tr> <td>FlowDirection</td> <td>Coverage</td> <td>The flowdirection coverage to compute the channelnetwork.</td> </tr> <tr> <td>z-Factor</td> <td>Double</td> <td>a z-factor for correct channelnetwork calculations when the surface z units are expressed in units different from the ground x,y units.</td> </tr> <tr> <td>threshold</td> <td>Double</td> <td>Filter rivers with flow accumulation greater than the threshold.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>coverage</td> <td>Coverage</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service()

dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

flowdirection = service.getProcess("Coverage.terrFlowdirection").execute(dem, 1, 1)

flowaccumulation = service.getProcess("Coverage.terrFlowaccumulation").execute(dem, 1)

channelnetwork = service.getProcess("Coverage.terrChannelnetwork").execute(dem, flowaccumulation, flowdirection, 1, 10)

channelnetwork.styles("#000000").getMap("channelnetwork")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

#### 视点分析

##### Coverage.viewshedByGrass

###### 描述

 Computes the viewshed of a point on an elevation raster map. Default format: NULL (invisible), vertical angle wrt viewpoint (visible). 

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Name of input raster map</td> </tr> <tr> <td>coordinates</td> <td>String</td> <td>Coordinates of viewing position</td> </tr> <tr> <td>observer_elevation</td> <td>String</td> <td>Viewing elevation above the ground</td> </tr> <tr> <td>target_elevation</td> <td>String</td> <td>Offset for target elevation above the ground</td> </tr> <tr> <td>max_distance</td> <td>String</td> <td>Maximum visibility radius. By default infinity (-1)</td> </tr> <tr> <td>direction_range</td> <td>String</td> <td>Minimum and maximum horizontal angle limiting viewshed (0 is East, counterclockwise) Options: 0-360</td> </tr> <tr> <td>refraction_coeff</td> <td>String</td> <td>Refraction coefficient Options: 0.0-1.0</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Computes the viewshed of a point on an elevation raster map. Default format: NULL (invisible), vertical angle wrt viewpoint (visible).</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

# 初始化
oge.initialize()
service = oge.Service()
# 读取数据
coverage = service.getCoverage(coverageID="GF1_PMS2_E113.6_N30.2_20200408_L1A0004725467", productID="GF1_L1_PMS2_EO")
temp = service.getProcess("Coverage.selectBands").execute(coverage, ["MSS2_band1"])

# 调用函数处理数据
ndvi = service.getProcess("Coverage.viewshedByGrass").execute(temp,"113.5,30.2","1.75","0.0","-1","0.14286")

# 设置渲染模式，其中"min":-1代表将-1映射到png图像的0，max": 1代表将1映射到png图像的255，"palette": ["gold", "yellow", "brown", "lightblue", "blue"]设置了渲染模式

vis_params = {'min': -1, 'max': 1,"palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

# 输出结果
ndvi.styles(vis_params).getMap("ndvi")
# 设置前端地图中心位置和显示层级
oge.mapclient.centerMap(113.47, 30.2, 12)

```

#### 地形指标

##### Coverage.tpiTopographicPositionIndexByGDAL

###### 描述

Outputs a single-band raster with values computed from the elevation. TPI stands for Topographic Position Index, which is defined as the difference between a central pixel and the mean of its surrounding cells.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>band</td> <td>Int</td> <td>The number of the band to use for elevation values</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>options</td> <td>String</td> <td>Additional GDAL command line options.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Outputs a single-band raster with values computed from the elevation. TPI stands for Topographic Position Index, which is defined as the difference between a central pixel and the mean of its surrounding cells.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

tpi = service.getProcess("Coverage.tpiTopographicPositionIndexByGDAL").execute(
    dem, 1,"False","")
vis_params = {"min": -100, "max": 100}

tpi.styles(vis_params).getMap("tpi")

oge.mapclient.centerMap(56.25, 28.40, 11)

```

##### Coverage.triTerrainRuggednessIndexByGDAL

###### 描述

Outputs a single-band raster with values computed from the elevation. TRI stands for Terrain Ruggedness Index, which is defined as the mean difference between a central pixel and its surrounding cells.

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Coverage</td> <td>Input Elevation raster layer</td> </tr> <tr> <td>band</td> <td>Int</td> <td>The number of the band to use for elevation values</td> </tr> <tr> <td>computeEdges</td> <td>String</td> <td>Generates edges from the elevation raster.</td> </tr> <tr> <td>options</td> <td>String</td> <td>For adding one or more creation options that control the raster to be created (colors, block size, file compression...).</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Coverage</td> <td>Coverage</td> <td>Outputs a single-band raster with values computed from the elevation. TRI stands for Terrain Ruggedness Index, which is defined as the mean difference between a central pixel and its surrounding cells.</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
dem = service.getCoverage(coverageID="ASTGTM_N28E056", productID="ASTER_GDEM_DEM30")

a = service.getProcess("Coverage.triTerrainRuggednessIndexByGDAL").execute(
    dem, 1, "False", "")
vis_params = {"min": -1, "max": 1,
              "palette": ["gold", "yellow", "brown", "lightblue", "blue"]}

a.styles(vis_params).getMap("a")
dem.styles(vis_params).getMap("dem")
oge.mapclient.centerMap(56.25, 28.40, 11)

```

### 3.3.2 空间统计工具

#### 空间关系建模

##### SpatialStats.GWModels.GWRbasic.autoFit

###### 描述

根据输入模型变量自动优选带宽并求解地理加权回归模型

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>kernel</td> <td>String</td> <td>kernel function: including gaussian, exponential, bisquare, tricube, boxcar</td> </tr> <tr> <td>approach</td> <td>String</td> <td>approach function: AICc, CV</td> </tr> <tr> <td>adaptive</td> <td>Boolean</td> <td>true for adaptive distance, false for fixed distance</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of basic GWR, including: yhat, residual, Intercept and coefficients (name of independent variable properties)</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# Basic GWR calculation with bandwidth auto selection

re_gwr=service.getProcess("SpatialStats.GWModels.GWRbasic.autoFit").execute(feature,"aging", "PCGDP,GI,FD,education","bisquare","AICc","true")

raster = service.getProcess("Feature.rasterizeByGDAL").execute(re_gwr,"yhat",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("valuePrediction")

```

##### SpatialStats.GWModels.GWRbasic.fit

###### 描述

根据输入的模型变量和指定带宽进行地理加权回归分析模型求解

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>bandwidth</td> <td>Double</td> <td>bandwidth value</td> </tr> <tr> <td>kernel</td> <td>String</td> <td>kernel function: including gaussian, exponential, bisquare, tricube, boxcar</td> </tr> <tr> <td>adaptive</td> <td>Boolean</td> <td>true for adaptive distance, false for fixed distance</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of basic GWR, including: yhat, residual, Intercept and coefficients (name of independent variable properties)</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# Basic GWR calculation with specific bandwidth

re_gwr=service.getProcess("SpatialStats.GWModels.GWRbasic.fit").execute(feature,"aging", "PCGDP,GI,FD,education",20,"bisquare","true")

raster = service.getProcess("Feature.rasterizeByGDAL").execute(re_gwr,"yhat",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("valuePrediction")

```

##### SpatialStats.GWModels.GWRbasic.auto

###### 描述

根据输入的变量自动优选模型变量，以及自动优选带宽，进行地理加权回归分析模型求解

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>kernel</td> <td>String</td> <td>kernel function: including gaussian, exponential, bisquare, tricube, boxcar</td> </tr> <tr> <td>approach</td> <td>String</td> <td>approach function: AICc, CV</td> </tr> <tr> <td>adaptive</td> <td>Boolean</td> <td>true for adaptive distance, false for fixed distance</td> </tr> <tr> <td>varSelTh</td> <td>Double</td> <td>threshold of variable selection, recommended: 3.0</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of basic GWR, including: yhat, residual, Intercept and coefficients (name of independent variable properties)</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# Basic GWR calculation with bandwidth and variables auto selection

re_gwr=service.getProcess("SpatialStats.GWModels.GWRbasic.auto").execute(feature,"aging", "PCGDP,GI,FD,education","bisquare","AICc","true",3.0)

raster = service.getProcess("Feature.rasterizeByGDAL").execute(re_gwr,"yhat",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("valuePrediction")

```

##### SpatialStats.GWModels.GWCorrelation

###### 描述

在充分考虑空间变量异质性的基础上，进行局部尺度的相关性分析

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>bandwidth</td> <td>Double</td> <td>bandwidth value</td> </tr> <tr> <td>kernel</td> <td>String</td> <td>kernel function: including gaussian, exponential, bisquare, tricube, boxcar</td> </tr> <tr> <td>adaptive</td> <td>Boolean</td> <td>true for adaptive distance, false for fixed distance</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of GW Correlation, including Covariance(cov_name1_name2), correlation(corr_name1_name2), spearman-correlation(scorr_name1_name2)</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GW Correlation

re_gwss=service.getProcess("SpatialStats.GWModels.GWCorrelation").execute(feature,"aging", "PCGDP,GI,FD,education",50,"bisquare","true")

raster = service.getProcess("Feature.rasterizeByGDAL").execute(re_gwss,"corr_PCGDP_GI",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("corr_PCGDP_GI")

```

##### SpatialStats.GWModels.GWAverage

###### 描述

对特定的空间位置进行局部尺度下均值和中位数的计算，以量化描述在不同尺度下单个空间变量的空间异质性特征

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>bandwidth</td> <td>Double</td> <td>bandwidth value</td> </tr> <tr> <td>kernel</td> <td>String</td> <td>kernel function: including gaussian, exponential, bisquare, tricube, boxcar</td> </tr> <tr> <td>adaptive</td> <td>Boolean</td> <td>true for adaptive distance, false for fixed distance</td> </tr> <tr> <td>quantile</td> <td>Boolean</td> <td>true for quantile value</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of GW Average, including local mean(property-names +_LM), variance(+_LVar), StandardDev(+_LSD), LocalSkewness(+_LSke), cv(+_LCV)</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GW Average

re_gwss=service.getProcess("SpatialStats.GWModels.GWAverage").execute(feature,"aging", "PCGDP,GI,FD,education",50,"bisquare","true","false")

raster = service.getProcess("Feature.rasterizeByGDAL").execute(re_gwss,"PCGDP_LM",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("LocalMean")

```

#### 分析模式

##### SpatialStats.STCorrelations.SpatialAutoCorrelation.globalMoranI

###### 描述

全局角度分析其属性值空间自相关模式特征

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>property</td> <td>String</td> <td>the property to calculate</td> </tr> <tr> <td>plot</td> <td>Boolean</td> <td>whether to plot Moran points, not supported now, please set false</td> </tr> <tr> <td>test</td> <td>Boolean</td> <td>whether to calculate p value</td> </tr> <tr> <td>weightstyle</td> <td>String</td> <td>neighbor weight type, including: W, B, C, U, recommended: 'W'</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of global Moran’s I</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# global Moran's I

morani = service.getProcess("SpatialStats.STCorrelations.SpatialAutoCorrelation.globalMoranI").execute(feature,"aging","false","true","W") 

morani.log("log")

```

##### SpatialStats.STCorrelations.SpatialAutoCorrelation.localMoranI

###### 描述

局部角度分析其属性值空间自相关模式特征

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>property</td> <td>String</td> <td>the property to calculate</td> </tr> <tr> <td>adjust</td> <td>Boolean</td> <td>whether to adjust n</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result feature of local Moran’s I, including local_moranI, expectation, local_var, local_z, local_pv</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# local Moran's I

result = service.getProcess("SpatialStats.STCorrelations.SpatialAutoCorrelation.localMoranI").execute(feature,"aging","false") 

raster = service.getProcess("Feature.rasterizeByGDAL").execute(result,"local_moranI",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("local_MoranI")

```

##### SpatialStats.BasicStatistics.AverageNearestNeighbor

###### 描述

根据每个要素与其最近邻要素之间的平均距离计算其最近邻指数

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input for calculation</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of average nearest neighbor</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# AverageNearestNeighbor

ann = service.getProcess("SpatialStats.BasicStatistics.AverageNearestNeighbor").execute(feature) 

ann.log("log")

```

##### SpatialStats.STCorrelations.CorrelationAnalysis.corrMat

###### 描述

全局角度量化表征两两变量间的线性相关关系特征

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>properties</td> <td>String</td> <td>properties want to calculate, separated by ','</td> </tr> <tr> <td>method</td> <td>String</td> <td>pearson or spearman method</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of correlation matrix</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# Correlation: arg3:[pearson, spearman]

corr = service.getProcess("SpatialStats.STCorrelations.CorrelationAnalysis.corrMat").execute(feature,"aging,PCGDP,GI,FD,TS,CL","pearson") 

corr.log("pearson correlation")

```

##### SpatialStats.STCorrelations.TemporalAutoCorrelation.ACF

###### 描述

面向时序数据的时序自相关分析函数

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>property</td> <td>String</td> <td>the property to calculate</td> </tr> <tr> <td>timelag</td> <td>Int</td> <td>time lag</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result feature of Auto-correlation Function</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# Autocorrelation Coefficient

result = service.getProcess("SpatialStats.STCorrelations.TemporalAutoCorrelation.ACF").execute(feature,"aging",10) 

result.log("ACF")

```

##### SpatialStats.SpatialRegression.SpatialLagModel.fit

###### 描述

空间滞后模型（Spatial Lag Model）是空间计量经济学中的一种模型，用于分析空间数据之间的相互依赖关系。该模型考虑了空间自相关性，即空间上相邻地区之间的相互影响，因此可以更准确地描述空间数据的特征。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of Spatial Lag Model, including fitValue, residual</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# SpatialLagModel

result = service.getProcess("SpatialStats.SpatialRegression.SpatialLagModel.fit").execute(feature,"aging","PCGDP,GI,FD,education") 

raster = service.getProcess("Feature.rasterizeByGDAL").execute(result,"fitValue",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("fitValue")

```

##### SpatialStats.BasicStatistics.DescriptiveStatistics

###### 描述

统计描述对象属性的基本信息

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input for calculation</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of statistics</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# DescriptiveStatistics

desc = service.getProcess("SpatialStats.BasicStatistics.DescriptiveStatistics").execute(feature) 

desc.log("log")

```

##### SpatialStats.SpatialRegression.SpatialErrorModel.fit

###### 描述

空间误差模型（Spatial Error Model，SEM）是一种空间计量经济学模型，主要用于研究空间数据的误差结构和空间自相关性。SEM模型认为，观测值之间的空间依赖关系是通过误差项来传递的，即误差项之间存在空间自相关性。这种空间自相关性可能是由于观测值之间的未观察到的空间因素或遗漏变量引起的。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of Spatial Error Model, including fitValue, residual</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# SpatialErrorModel

result = service.getProcess("SpatialStats.SpatialRegression.SpatialErrorModel.fit").execute(feature,"aging","PCGDP,GI,FD,education") 

raster = service.getProcess("Feature.rasterizeByGDAL").execute(result,"fitValue",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("fitValue")

```

##### SpatialStats.SpatialRegression.SpatialDurbinModel.fit

###### 描述

空间杜宾模型（Spatial Durbin Model，简称SDM）是一种用于分析空间数据的统计模型。它是杜宾模型（Durbin Model）的扩展，考虑了空间依赖性和空间自回归效应。SDM假定因变量取值除受本地自变量的影响外，还会受到邻近地区的自变量影响，即在模型中加入自变量的空间滞后值。

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of Spatial Durbin Model, including fitValue, residual</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# SpatialDurbinModel

result = service.getProcess("SpatialStats.SpatialRegression.SpatialDurbinModel.fit").execute(feature,"aging","PCGDP,GI,FD,education") 

raster = service.getProcess("Feature.rasterizeByGDAL").execute(result,"fitValue",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("fitValue")

```

##### SpatialStats.SpatialRegression.LinearRegression.feature

###### 描述

对矢量的属性进行线性回归

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>propertyY</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>propertiesX</td> <td>String</td> <td>independent variable properties, separated by ','</td> </tr> <tr> <td>Intercept</td> <td>Boolean</td> <td>whether need Intercept</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Feature</td> <td>Feature</td> <td>result of linear regression for feature, including yhat, residual</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# LinearRegression for feature

result = service.getProcess("SpatialStats.SpatialRegression.LinearRegression.feature").execute(feature,"aging","PCGDP,GI,FD,education","true") 

raster = service.getProcess("Feature.rasterizeByGDAL").execute(result,"yhat",0,"False","1",0.01,0.01,"",0)

vis_params = {"palette": ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c","#fc4e2a","#e31a1c","#bd0026","#800026"]}

raster.styles(vis_params).getMap("fitValue")

```

#### 地理探测器

##### SpatialStats.SpatialHeterogeneity.GeoFactorDetector

###### 描述

探测研究对象的空间分异性，以及探测各个因子解释空间分异性的程度

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>y_title</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>x_titles</td> <td>String</td> <td>independent variable properties</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of risk detector for GeoDetector</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GeoDetector, FactorDetector

result = service.getProcess("SpatialStats.SpatialHeterogeneity.GeoFactorDetector").execute(feature,"aging","PCGDP,GI,FD,education") 

result.log("FactorDetector")

```

##### SpatialStats.SpatialHeterogeneity.GeoInteractionDetector

###### 描述

识别不同风险因子之间的交互作用，即评估因子共同作用或独立作用时对因变量的解释力

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>y_title</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>x_titles</td> <td>String</td> <td>independent variable properties</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of factor detector for GeoDetector</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GeoDetector, InteractionDetector

result = service.getProcess("SpatialStats.SpatialHeterogeneity.GeoInteractionDetector").execute(feature,"aging","PCGDP,GI,FD,education") 

result.log("InteractionDetector")

```

##### SpatialStats.SpatialHeterogeneity.GeoEcologicalDetector

###### 描述

用于判断两个子区域间的属性均值方差等是否有显著的差别

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>y_title</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>x_titles</td> <td>String</td> <td>independent variable properties</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of interaction detector for GeoDetector</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GeoDetector, EcologicalDetector

result = service.getProcess("SpatialStats.SpatialHeterogeneity.GeoEcologicalDetector").execute(feature,"aging","PCGDP,GI,FD,education") 

result.log("EcologicalDetector")

```

##### SpatialStats.SpatialHeterogeneity.GeoRiskDetector

###### 描述

用于比较两因子对属性的空间分布的影响是否有显著的差异，显著的因素对风险起主要作用

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>featureRDD</td> <td>Feature</td> <td>feature input</td> </tr> <tr> <td>y_title</td> <td>String</td> <td>dependent variable property</td> </tr> <tr> <td>x_titles</td> <td>String</td> <td>independent variable properties</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>result of ecological detector for GeoDetector</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()

service = oge.Service.initialize()

# use your data for getFeature

feature= service.getFeature(featureId="EasternChina_PopulationAging_Vector")

feature.styles("#000000").getMap("Aging")

oge.mapclient.centerMap(115,31,4)

# GeoDetector, RiskDetector

result = service.getProcess("SpatialStats.SpatialHeterogeneity.GeoRiskDetector").execute(feature,"aging","PCGDP,GI,FD,education") 

result.log("RiskDetector")

```

## 3.4 专题算子

### 3.4.1 时空模式挖掘工具

#### 创建时空立方体

##### Cube.load

###### 描述

创建一个Cube

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>productIds</td> <td>List&lt;string&gt;</td> <td>The product id list for cube creation.</td> </tr> <tr> <td>StartTime</td> <td>String</td> <td>The start time of the product.</td> </tr> <tr> <td>EndTime</td> <td>String</td> <td>The end time of the product.</td> </tr> <tr> <td>geom</td> <td>List&lt;float&gt;</td> <td>The geom of the product.</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Cube</td> <td>Cube</td> <td>创建的新的Cube</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 获取指定的Cube数据
sentinelCube = service.getCube(CubeName="Long_sequence_cube", 
    dateTime=["2014-01-16 00:00:00", "2015-01-17 23:59:59"],
    extent=[104.50, 27.2, 104.8, 27.38])
# 进行NDVI操作
vis_params = {"min": 0, "max": 500, "bands": ["Red"], 
    "palette": ["oldlace", "peachpuff", "gold", "olive", "lightyellow", "yellow", "lightgreen", "limegreen", "brown", "lightblue", "blue"]}
# 上色操作
styledCube = sentinelCube.styles(vis_params).map()
oge.mapclient.centerMap(104.65, 27.29, 11)

```

#### 添加样式

##### Cube.addStyles

###### 描述

Cube中添加样式

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>cube</td> <td>Cube</td> <td>The cube to visualize</td> </tr> <tr> <td>products</td> <td>Object</td> <td>The products in cube to visualize</td> </tr> <tr> <td>bands</td> <td>Object</td> <td></td> </tr> <tr> <td>gain</td> <td>Object</td> <td></td> </tr> <tr> <td>bias</td> <td>Object</td> <td></td> </tr> <tr> <td>min</td> <td>Object</td> <td></td> </tr> <tr> <td>max</td> <td>Object</td> <td></td> </tr> <tr> <td>gamma</td> <td>Object</td> <td></td> </tr> <tr> <td>opacity</td> <td>Float</td> <td></td> </tr> <tr> <td>palette</td> <td>Object</td> <td></td> </tr> <tr> <td>format</td> <td>String</td> <td>png</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Cube</td> <td>Cube</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 获取指定的Cube数据
sentinelCube = service.getCube(CubeName="Long_sequence_cube", dateTime=["2014-01-16 00:00:00", "2015-01-17 23:59:59"],
                                 extent=[104.50, 27.2, 104.8, 27.38])
# 进行NDVI操作
vis_params = {"min": 0, "max": 500, "bands": ["Red"], "palette": ["oldlace", "peachpuff", "gold", "olive", "lightyellow", "yellow",
                                 "lightgreen", "limegreen", "brown", "lightblue", "blue"]}
# 上色操作
styledCube = sentinelCube.styles(vis_params).map()
oge.mapclient.centerMap(104.65, 27.29, 11)

```

#### 分析

##### Cube.NDVI

###### 描述

计算栅格立方体的NDVI

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>input</td> <td>Cube</td> <td>ThecubetocomputeNDVI.</td> </tr> <tr> <td>bandNames</td> <td>List&lt;string&gt;</td> <td>Alistofnamesspecifyingthebandstouse.Ifnotspecified,thefirstandsecondbandsareused</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>Cube</td> <td>Cube</td> </tr> </tbody> </table>

###### 示例代码

```python
import oge

oge.initialize()
service = oge.Service()
# 获取指定的Cube数据
sentinelCube = service.getCube(CubeName="SENTINEL-2 Level-2A MSI", dateTime=["2019-01-17 08:59:59", "2019-01-19 21:00:01"],
                                 extent=[4.72, 51.71, 4.73, 51.72])
# 进行NDVI操作
ndviCube = service.getProcess("Cube.NDVI").execute(sentinelCube, ["B3", "B4"])
vis_params = {"min": 0, "max": 500, "bands": ["ndvi"], "palette": ["oldlace", "peachpuff", "gold", "olive", "lightyellow", "yellow",
                                 "lightgreen", "limegreen", "brown", "lightblue", "blue"]}
# 上色操作
styledCube = ndviCube.styles(vis_params).map()
oge.mapclient.centerMap(4.72 51.71, 12)

```

### 3.4.2 碳排放系列工具

#### 碳排放工具

##### Carbon.getProvinceCarbon

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>region</td> <td>List&lt;string&gt;</td> <td>省名列表</td> </tr> <tr> <td>period</td> <td>List&lt;integer&gt;</td> <td>年份列表</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>省级碳排放统计JSON字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取研究区域内省级碳排放统计和碳核算相关的社会经济指标统计
provinceCarbon = carbon.getProvinceCarbon(region, period)
print(provinceCarbon)

```

##### Carbon.getProvinceCarbonIndex

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>region</td> <td>List&lt;string&gt;</td> <td>省名列表</td> </tr> <tr> <td>period</td> <td>List&lt;integer&gt;</td> <td>年份列表</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>省级社会经济指标JSON字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取研究区域内省级碳排放统计和碳核算相关的社会经济指标统计
provinceCarbon = carbon.getProvinceCarbon(region, period)
provinceCarbonIndex = carbon.getProvinceCarbonIndex(region, period)
print(provinceCarbonIndex)

```

##### Carbon.getCityByProvince

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>region</td> <td>List&lt;string&gt;</td> <td>省名列表</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>省内地级行政区划JSON数组字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取区域内的市级行政区划的列表
regionCities = carbon.getCityByProvince(region)
print(regionCities)

```

##### Carbon.getCityCarbonIndex

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>region</td> <td>List&lt;string&gt;</td> <td>省名列表</td> </tr> <tr> <td>period</td> <td>List&lt;integer&gt;</td> <td>年份列表</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>地级社会经济指标JSON字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取区域内的市级行政区划的列表
regionCities = carbon.getCityByProvince(region)

# 获取市级行政区划的碳核算相关的社会经济指标统计
cityCarbonIndex= carbon.getCityCarbonIndex(regionCities, period)
print(cityCarbonIndex)

```

##### Carbon.getCityCarbonProportion

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>provinceCarbonIndex</td> <td>String</td> <td>省级社会经济指标</td> </tr> <tr> <td>cityCarbonIndex</td> <td>String</td> <td>地级社会经济指标</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>碳核算分配比例JSON字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取研究区域内省级碳排放统计和碳核算相关的社会经济指标统计
provinceCarbon = carbon.getProvinceCarbon(region, period)
provinceCarbonIndex = carbon.getProvinceCarbonIndex(region, period)

# 获取区域内的市级行政区划的列表
regionCities = carbon.getCityByProvince(region)

# 获取市级行政区划的碳核算相关的社会经济指标统计
cityCarbonIndex = carbon.getCityCarbonIndex(regionCities, period)

# 获取市级行政区划的各类指标的碳核算分配比例
cityCarbonProportionList = carbon.getCityCarbonProportion(provinceCarbonIndex, cityCarbonIndex)
print(cityCarbonProportionList)

```

##### Carbon.getCityCarbon

###### 描述

暂无描述

###### 输入参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>provinceCarbon</td> <td>String</td> <td>省级碳排放JSON字符串</td> </tr> <tr> <td>cityCarbonProportion</td> <td>String</td> <td>碳核算分配比例JSON字符串</td> </tr> </tbody> </table>

###### 输出参数

<table> <thead> <tr> <th>参数名</th> <th>参数类型</th> <th>详细说明</th> </tr> </thead> <tbody> <tr> <td>result</td> <td>String</td> <td>地级碳核算JSON字符串</td> </tr> </tbody> </table>

###### 示例代码

```python
# 初始化
import oge
oge.initialize()
# 获取省级统计
region = ["湖北省"]
period = [2018]
carbon = oge.carbonEmission()

# 获取研究区域内省级碳排放统计和碳核算相关的社会经济指标统计
provinceCarbon = carbon.getProvinceCarbon(region, period)
provinceCarbonIndex = carbon.getProvinceCarbonIndex(region, period)

# 获取区域内的市级行政区划的列表
regionCities = carbon.getCityByProvince(region)

# 获取市级行政区划的碳核算相关的社会经济指标统计
cityCarbonIndex = carbon.getCityCarbonIndex(regionCities, period)

# 获取市级行政区划的各类指标的碳核算分配比例
cityCarbonProportionList = carbon.getCityCarbonProportion(
    provinceCarbonIndex, cityCarbonIndex)

# 市级碳核算
cityCarbonList = carbon.getCityCarbon(provinceCarbon, cityCarbonProportionList)
print(cityCarbonList)

```

# 4. 应用开发案例

## 4.1 武汉市梁子湖流域汛期淹没情况

本案例旨在通过比较武汉市梁子湖在汛期前后的水面覆盖范围，获取梁子湖在汛期期间淹没的区域，然后设置多个POI点集（如耕地、观测设备、道路等），提取淹没信息，然后根据POI点淹没属性进行筛选，得到被淹没的POI点，输出被淹没POI点的属性信息，并在地图上显示被淹没POI点的位置，为汛期灾害强度评估，灾害预警和财产损失评估提供数据和技术支撑。

本案例的试验区为武汉市梁子湖流域，梁子湖是武汉市黄陂区的一个人工水库，防洪是其主要功能之一。武汉地区位于亚热带季风气候区，其特点是雨季较为长久，持续性强降雨频繁。这种气候条件使得梁子湖在汛期经常受到影响，需要及时根据天气预报和实时水情变化采取相应的管理和调度措施。

### 处理流程

![1712886110589](/docs/./应用开发_files/1712886110589.png)

### 处理代码

```python
import oge
#本案例旨在通过比较武汉市梁子湖在汛期前后的水面覆盖范围，获取梁子湖在汛期期间淹没的区域；
#然后设置多个POI点集（如耕地、观测设备、道路等），提取淹没信息；
#最后根据POI点淹没属性进行筛选，得到被淹没的POI点，输出被淹没POI点的属性信息；
#并在地图上显示被淹没POI点的位置，为汛期灾害强度评估，灾害预警和财产损失评估提供数据和技术支撑。
oge.initialize()
service = oge.Service()
# 获取汛期前（2015）和汛期后（2016）年的Landsat影像
landsat_2015 = service.getCoverage(coverageID="LC08_L1TP_122039_20150612_20200909_02_T1", productID="LC08_L1TP_C02_T1")
landsat_2016 = service.getCoverage(coverageID="LC08_L1TP_122039_20160902_20200906_02_T1", productID="LC08_L1TP_C02_T1")
# 将影像的像素值转为float型
lc2015_f = service.getProcess("Coverage.toFloat").execute(landsat_2015)
lc2016_f = service.getProcess("Coverage.toFloat").execute(landsat_2016)
#计算ndwi
ndwi_2015 = service.getProcess("Coverage.normalizedDifference").execute(lc2015_f, ["B3", "B5"])
ndwi_2016 = service.getProcess("Coverage.normalizedDifference").execute(lc2016_f, ["B3", "B5"])
#对ndwi结果进行二值化，设置0.03阈值，二值化结果为255表示水面，0表示非水面
ndwi_2015_bin = service.getProcess("Coverage.binarization").execute(ndwi_2015, 0.03)
ndwi_2016_bin = service.getProcess("Coverage.binarization").execute(ndwi_2016, 0.03)
#用2016年二值化结果减2015年，255表示淹没区域，0表示无变化区域，-255表示干涸区域
ndwi_sub = service.getProcess("Coverage.subtract").execute(ndwi_2016_bin, ndwi_2015_bin)
vis_params = {"min": -255, "max": 255, "palette": ["#808080", "#949494", "#a9a9a9", "#bdbebd", "#d3d3d3","#e9e9e9"]}
ndwi_sub.styles(vis_params).getMap("淹没情况")
#构建观测点集
point_1 = service.getProcess("Feature.point").execute("[114.558, 30.206]", "{id:1, pos:龙王头}", "EPSG:4326")
point_2 = service.getProcess("Feature.point").execute("[114.473, 30.108]", "{id:2, pos:彭塘村}", "EPSG:4326")
point_3 = service.getProcess("Feature.point").execute("[114.384, 30.187]", "{id:3, pos:青山头}", "EPSG:4326")
point_4 = service.getProcess("Feature.point").execute("[114.458, 30.246]", "{id:4, pos:北咀渡口}", "EPSG:4326")
point_5 = service.getProcess("Feature.point").execute("[114.561, 30.260]", "{id:5, pos:梁子镇}", "EPSG:4326")
point_6 = service.getProcess("Feature.point").execute("[114.478, 30.166]", "{id:6, pos: 毛针寺}", "EPSG:4326")
point_7 = service.getProcess("Feature.point").execute("[114.460, 30.138]", "{id:7, pos:野头咀}", "EPSG:4326")
point_8 = service.getProcess("Feature.point").execute("[114.629, 30.188]", "{id:8, pos:毛家咀}", "EPSG:4326")
point_9 = service.getProcess("Feature.point").execute("[114.583, 30.164]", "{id:9, pos:廖家湾}", "EPSG:4326")
point_10 = service.getProcess("Feature.point").execute("[114.465, 30.158]", "{id:10, pos:龟山}", "EPSG:4326")
point_11 = service.getProcess("Feature.point").execute("[114.419, 30.183]", "{id:11, pos:墨斗山}", "EPSG:4326")
point_collection = service.getProcess("Feature.featureCollection").execute([point_1,point_2,point_3, point_4, point_5, point_6, point_7, point_8, point_9, point_10, point_11])
#用观测点集提取ndwi_sub中的值作为新的属性值
pc_extract = service.getProcess("Feature.rasterSamplingByQGIS").execute(point_collection,ndwi_sub,"ndwi_sub")
#将提取淹没属性值后的观测点集转为表格数据
pc_sheet = service.getProcess("Sheet.pointToSheet").execute(pc_extract)
# 根据淹没属性删选出被淹没的表格数据
ps_select = service.getProcess("Sheet.filterByHeader").execute(pc_sheet,"ndwi_sub1","255.0")
ps_select.log("被淹没点属性表")
#将被淹没的表格数据转为被淹没的观测点数据
ps_select_p = service.getProcess("Sheet.toPoint").execute(ps_select)
#设置显示样式，将被淹没的观测点数据显示出来
ps_select_p.styles(["#000000"]).getMap("被淹没点")
oge.mapclient.centerMap(114.58, 30.27, 9)
#最后的结果由两部分组成，
#一部分是控制台输出的被淹没点属性表
#另一部分是地图上显示的淹没情况（栅格）和被淹没点（点矢量）
#其中淹没情况展示了在汛期内，变干涸的区域（黑色）、被淹没的区域（白色）和无变化区域（灰色）
#最终在选取的11个poi点中，共有龙王头、青山头、北咀渡口、毛家咀和廖家湾5个poi点周边有被淹没的情况

```

### 处理结果

淹没点

![1712886469479](/docs/./应用开发_files/1712886469479.png)

## 4.2 市区择房分析

如何找到环境好、购物方便、小孩上学方便的居住区地段是购房者最关心的问题，因此购房者就需要从总体上对商品房的信息进行研究分析，选择最适宜的购房地段。本案例旨在利用缓冲区分析和叠置分析结合案例数据解决住房选址问题。

​ 所寻求的市区是噪声要小，距离商业中心和各大名牌高中要近，是为了环境优雅离名胜古迹较近。综合上述条件,给定一个定量的限定如下。

1) 离主要市区交通要道距离100m之外，交通要道的车流量大，噪声产生的主要源于此street为道路类型中的主要市区交通要道)﹔

2) 为了方便日常生活，距离商场要在500m以内;

3) 距名牌高中在500m之内，以便小孩上学便捷;

4) 距名胜古迹800m之内。

按要求分别对商场、学校、名牌高中和名胜古迹建立点状缓冲区，求这三者的交集A。然后根据要求建立主干道噪声的线状缓冲区B，求出A与B的差集，最终所得的结果即为最佳住房区域。

### 处理流程

![1712885621660](/docs/./应用开发_files/1712885621660.png)

### 处理代码

```python
import oge
# 本案例旨在利用缓冲区分析和叠置分析结合案例数据解决住房选址问题
oge.initialize()
service = oge.Service.initialize()
# 创建景区、商场、饭店、道路矢量数据
famousPlace = service.getProcess("Feature.load").execute("HC_FamousPlace_Case","null","EPSG:4326")
market = service.getProcess("Feature.load").execute("HC_Market_Case","null","EPSG:4326")
school = service.getProcess("Feature.load").execute("HC_School_Case","null","EPSG:4326")
street = service.getProcess("Feature.load").execute("WHU_Street_Case","null","EPSG:4326")
mainStreet = service.getProcess("Feature.load").execute("HC_MainStreets_Case","null","EPSG:4326")
# 重投影
famousPlace_repro = service.getProcess("Feature.reproject").execute(famousPlace,"EPSG:3857")
market_repro = service.getProcess("Feature.reproject").execute(market,"EPSG:3857")
school_repro = service.getProcess("Feature.reproject").execute(school,"EPSG:3857")
street_repro = service.getProcess("Feature.reproject").execute(street,"EPSG:3857")
# 创建缓冲区
famousPlace_Buffer = service.getProcess("Feature.buffer").execute(famousPlace_repro,800,"EPSG:3857")
market_Buffer = service.getProcess("Feature.buffer").execute(market_repro,500,"EPSG:3857")
school_Buffer = service.getProcess("Feature.buffer").execute(school_repro,500,"EPSG:3857")
street_Buffer = service.getProcess("Feature.bufferVectorsByGDAL").execute(street_repro, 100, "False", "default", "False", "geometry", "default")
# 求学校、商业中心和名胜古迹的交集
tmp = service.getProcess("Feature.intersection").execute(school_Buffer,market_Buffer,"EPSG:3857")
intersection = service.getProcess("Feature.intersection").execute(tmp,famousPlace_Buffer,"EPSG:3857")
# 求主干道缓冲区的差集
difference = service.getProcess("Feature.difference").execute(intersection,street_Buffer,"EPSG:3857")
# 重投影
difference_repro = service.getProcess("Feature.reproject").execute(difference,"EPSG:4326")
# 可视化
school.styles(["#DD0000"]).getMap("schools")
difference_repro.styles(["#99CC00"]).getMap("Best Area")
mainStreet.styles(["#FFCC33"]).getMap("Streets")
oge.mapclient.centerMap(114.32,30.54,13)

```

### 处理结果

最佳购房区域

![1712885982623](/docs/./应用开发_files/1712885982623.png)
