"""郁江双期水体变化；在 OGE Python 环境执行，每次只导出一个 Coverage。"""

import oge

""""" begin param definition
Args:
    coverageID (String): 灾后B02/B03/B04/B08光学影像
    beforeCoverageID (String): 灾前B02/B03/B04/B08光学影像
    swirPath (String): 灾后B11/B12影像
    beforeSwirPath (String): 灾前B11/B12影像
    sclPath (String): 灾后SCL影像
    beforeSclPath (String): 灾前SCL影像
    poiRasterPath (String): 同网格关注点ID栅格
    poiMaxId (Integer): 关注点最大正整数ID
    ndwiThreshold (Double): NDWI基准阈值，严格大于为水体
    mndwiThreshold (Double): MNDWI基准阈值，严格大于为水体
    thresholdStep (Double): 敏感性分析中各指数阈值的正负扰动步长
    reflectanceScale (Double): 已处理偏移的源数据反射率乘数
    targetCrs (String): 本案例固定EPSG:32649
    resolution (Double): 本案例固定10米分析网格
    outputName (String): 本次导出名称，仅英文数字下划线和短横线
end param definition """ ""

coverageID = "myData/guigang_20260712_optical10m_yujiang_v1.tif"
beforeCoverageID = "myData/guigang_20260622_optical10m_yujiang_v1.tif"
swirPath = "myData/guigang_20260712_swir20m_yujiang_v1.tif"
beforeSwirPath = "myData/guigang_20260622_swir20m_yujiang_v1.tif"
sclPath = "myData/guigang_20260712_scl20m_yujiang_v1.tif"
beforeSclPath = "myData/guigang_20260622_scl20m_yujiang_v1.tif"
poiRasterPath = "myData/guigang_yujiang_poi10m_v1.tif"
poiMaxId = 30
ndwiThreshold = 0.0
mndwiThreshold = 0.0
thresholdStep = 0.05
reflectanceScale = 0.0001
targetCrs = "EPSG:32649"
resolution = 10.0
outputName = "yujiang_flood_analysis"


def validate():
    paths = (
        coverageID,
        beforeCoverageID,
        swirPath,
        beforeSwirPath,
        sclPath,
        beforeSclPath,
    )
    required = paths + (poiRasterPath,)
    if not all(
        isinstance(p, str) and p == p.strip() and p.startswith("myData/") and len(p) > 7
        for p in required
    ):
        raise ValueError("输入路径必须为myData/文件名")
    if len(set(paths)) != 6:
        raise ValueError("两期光学、SWIR、SCL必须为六份不同影像")
    if (
        not isinstance(outputName, str)
        or not 1 <= len(outputName) <= 80
        or any(
            c not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-"
            for c in outputName
        )
    ):
        raise ValueError("outputName须为1至80位英文数字、下划线或短横线")
    if (
        targetCrs != "EPSG:32649"
        or type(resolution) not in (int, float)
        or resolution != 10
    ):
        raise ValueError("本案例仅支持已核查的EPSG:32649、10米网格")
    if type(reflectanceScale) not in (int, float) or not 0 < reflectanceScale < float(
        "inf"
    ):
        raise ValueError("reflectanceScale必须为有限正数")
    if not all(
        type(t) in (int, float) and -1 <= t <= 1
        for t in (ndwiThreshold, mndwiThreshold)
    ):
        raise ValueError("指数阈值必须在[-1,1]内")
    if type(thresholdStep) not in (int, float) or not 0 < thresholdStep <= 1:
        raise ValueError("thresholdStep必须在(0,1]内")
    if not all(
        -1 <= t - thresholdStep and t + thresholdStep <= 1
        for t in (ndwiThreshold, mndwiThreshold)
    ):
        raise ValueError("扰动后的阈值必须仍在[-1,1]内，不自动截断")
    if type(poiMaxId) is not int or not 1 <= poiMaxId <= 65535:
        raise ValueError("poiMaxId必须是1至65535的整数")


def op(name, *args):
    try:
        return service.getProcess(name).execute(*args)
    except Exception as error:
        raise RuntimeError(f"OGE算子{name}调用失败：{error}") from error


def both(a, b):
    return op("Coverage.and", a, b)


def either(a, b):
    return op("Coverage.or", a, b)


def invert(a):
    return op("Coverage.not", a)


def above(a, threshold):
    return op("Coverage.binarization", a, threshold)


def scale(a, factor):
    return op("Coverage.multiplyNum", a, factor)


def add(a, b):
    return op("Coverage.add", a, b)


def load(path, names):
    image = op("Coverage.toFloat", service.getCoverage(path))
    # 已核查源范围和原点一致；最近邻保持SCL和ID，不增加SWIR空间细节。
    image = op(
        "Coverage.warpByGDAL",
        image,
        "",
        targetCrs,
        "0",
        -9999.0,
        resolution,
        "",
        "0",
        "",
        "",
        "False",
        "",
    )
    return op("Coverage.rename", image, names)


def normalized(a, b, valid):
    denominator = add(a, b)
    valid = both(valid, above(op("Coverage.abs", denominator), 1e-12))
    numerator = op("Coverage.mask", op("Coverage.subtract", a, b), valid, 0, 0)
    denominator = op("Coverage.mask", denominator, valid, 0, 1)
    value = op("Coverage.divide", numerator, denominator)
    valid = both(valid, invert(above(op("Coverage.abs", value), 1)))
    return value, valid


def read_scene(optical_path, swir_path, scl_path):
    optical = load(optical_path, ["B02", "B03", "B04", "B08"])
    swir = load(swir_path, ["B11", "B12"])
    scl = load(scl_path, ["SCL"])
    zero = scale(scl, 0)
    clear = both(above(scl, 3), invert(above(scl, 6)))
    raw = [
        op("Coverage.unmask", op("Coverage.selectBands", source, [band]), zero)
        for source, band in ((optical, "B03"), (optical, "B08"), (swir, "B11"))
    ]
    valid = [both(clear, above(band, 0)) for band in raw]
    green, nir, shortwave = [scale(band, reflectanceScale) for band in raw]
    ndwi, ndwi_valid = normalized(green, nir, both(valid[0], valid[1]))
    mndwi, mndwi_valid = normalized(green, shortwave, both(valid[0], valid[2]))
    return {
        "ndwi": ndwi,
        "mndwi": mndwi,
        "ndwi_valid": ndwi_valid,
        "mndwi_valid": mndwi_valid,
        "valid": both(ndwi_valid, mndwi_valid),
        "clear": clear,
    }


def water_state(scene, ndwi_limit, mndwi_limit):
    a = above(scene["ndwi"], ndwi_limit)
    b = above(scene["mndwi"], mndwi_limit)
    water = both(both(a, b), scene["valid"])
    disagreement = both(both(either(a, b), invert(both(a, b))), scene["valid"])
    return water, disagreement


def compare(before, after, ndwi_limit, mndwi_limit):
    bw, bd = water_state(before, ndwi_limit, mndwi_limit)
    aw, ad = water_state(after, ndwi_limit, mndwi_limit)
    common = both(before["valid"], after["valid"])
    uncertain = both(common, either(bd, ad))
    comparable = both(common, invert(uncertain))
    return {
        "before_water": bw,
        "after_water": aw,
        "common_valid_mask": common,
        "comparison_valid_mask": comparable,
        "uncertain_mask": uncertain,
        "new_flood": both(comparable, both(aw, invert(bw))),
        "persistent_water": both(comparable, both(bw, aw)),
        "receded_water": both(comparable, both(bw, invert(aw))),
    }


def named(image, name, value_range, valid=None):
    image = op("Coverage.toFloat", image)
    if valid is not None:
        image = op("Coverage.mask", image, valid, 0, -9999)
    image = op("Coverage.setValidDataRange", image, value_range)
    return op("Coverage.rename", image, [name])


def combine(bands):
    result = bands[0][1]
    for name, band in bands[1:]:
        result = op("Coverage.addBands", result, band, [name], False, False)
    return result


def sensitivity(before, after):
    votes = scale(before["valid"], 0)
    for a in (-thresholdStep, 0, thresholdStep):
        for b in (-thresholdStep, 0, thresholdStep):
            candidate = compare(before, after, ndwiThreshold + a, mndwiThreshold + b)
            votes = add(votes, candidate["new_flood"])
    return votes


def build_products(before, after):
    change = compare(before, after, ndwiThreshold, mndwiThreshold)
    common = change["common_valid_mask"]
    comparable = change["comparison_valid_mask"]
    missing = invert(common)
    classes = add(change["persistent_water"], scale(change["new_flood"], 2))
    classes = add(classes, scale(change["receded_water"], 3))
    classes = add(classes, scale(change["uncertain_mask"], 4))
    classes = add(classes, scale(missing, 5))
    # 0双方有效，1仅灾前无效，2仅灾后无效，3双方无效。
    quality = add(invert(before["valid"]), scale(invert(after["valid"]), 2))
    products = {
        "change_class": named(classes, "change_class", [0, 5]),
        "quality_class": named(quality, "quality_class", [0, 3]),
    }
    for name, image in change.items():
        valid = None
        if name in ("new_flood", "persistent_water", "receded_water"):
            valid = comparable
        elif name in ("before_water", "after_water"):
            scene = before if name == "before_water" else after
            _, disagreement = water_state(scene, ndwiThreshold, mndwiThreshold)
            valid = both(scene["valid"], invert(disagreement))
        products[name] = named(image, name, [0, 1], valid)
    for index in ("ndwi", "mndwi"):
        for prefix, scene in (("before", before), ("after", after)):
            name = prefix + "_" + index
            products[name] = named(scene[index], name, [-1, 1], scene[index + "_valid"])
        name = index + "_change"
        products[name] = named(
            op("Coverage.subtract", after[index], before[index]),
            name,
            [-2, 2],
            both(before[index + "_valid"], after[index + "_valid"]),
        )
    votes = sensitivity(before, after)
    stable = above(votes, 8)
    sensitive = both(above(votes, 0), invert(stable))
    states = add(add(sensitive, scale(stable, 2)), scale(missing, 3))
    products["flood_vote_count"] = named(votes, "flood_vote_count", [0, 9], common)
    products["stable_flood"] = named(stable, "stable_flood", [0, 1], common)
    products["sensitivity_class"] = named(states, "sensitivity_class", [0, 3])
    poi = op(
        "Coverage.unmask", load(poiRasterPath, ["poi_id"]), scale(after["clear"], 0)
    )
    poi_valid = both(above(poi, 0), invert(above(poi, poiMaxId)))
    products["poi_id"] = named(poi, "poi_id", [1, poiMaxId], poi_valid)
    products["poi_status"] = named(classes, "poi_status", [0, 5], poi_valid)
    return products


validate()
oge.initialize()
service = oge.Service()
before = read_scene(beforeCoverageID, beforeSwirPath, beforeSclPath)
after = read_scene(coverageID, swirPath, sclPath)
products = build_products(before, after)
result = combine(list(products.items()))
result.export(
    {
        "description": outputName,
        "crs": targetCrs,
        "scale": resolution,
        "fileName": outputName,
        "fileFormat": "tif",
    }
)
