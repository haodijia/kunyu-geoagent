import { cn as classNames } from "@/lib/utils";
import { FolderClose, FolderOpen } from "@icon-park/vue-next";
import { computed, defineComponent, type VNodeChild } from "vue";
interface WorkspaceCollapseProps {
  /** 是否展开 */
  expanded: boolean;
  /** 切换展开状态的回调 */
  onToggle: () => void;
  /** 折叠面板的标题 */
  header: VNodeChild;
  /** 折叠面板的内容 */
  children?: VNodeChild;
  /** 额外的类名 */
  class?: string;
  /** 侧栏是否折叠 - 折叠时隐藏组标题并移除缩进 */
  siderCollapsed?: boolean;
  /** 标题尾部插槽 - 例如 hover 显示的菜单按钮，点击不会触发 onToggle */
  trailing?: VNodeChild;
  /** 让头部在滚动时吸顶常驻 - 用于会话过长的项目组，下滑时逐个切换项目标题 */
  stickyHeader?: boolean;
  /** 吸顶时距滚动容器顶部的偏移(px)，用于让位给上方常驻的分区标题 */
  stickyTop?: number;
  /** The header's key among the rows the arrow keys move through (`useRovingRows`), and its place in the Tab order. */
  rowKey?: string;
  tabIndex?: number;
}

/**
 * 工作空间折叠组件 - 简单的折叠面板，用于工作空间分组
 */
const WorkspaceCollapse = defineComponent(
  (componentProps: WorkspaceCollapseProps, { slots }) => {
    const expanded = computed(() => componentProps.expanded),
      onToggle = computed(() => componentProps.onToggle),
      header = computed(() => componentProps.header),
      children = () => slots.default?.(),
      className = computed(() => componentProps.class),
      siderCollapsed = computed(() =>
        componentProps.siderCollapsed === undefined
          ? false
          : componentProps.siderCollapsed,
      ),
      trailing = computed(() => componentProps.trailing),
      stickyHeader = computed(() =>
        componentProps.stickyHeader === undefined
          ? false
          : componentProps.stickyHeader,
      ),
      stickyTop = computed(() =>
        componentProps.stickyTop === undefined ? 0 : componentProps.stickyTop,
      ),
      rowKey = computed(() => componentProps.rowKey),
      tabIndex = computed(() =>
        componentProps.tabIndex === undefined ? 0 : componentProps.tabIndex,
      );
    // 侧栏折叠时，强制展开内容并隐藏头部
    const showContent = computed(() => siderCollapsed.value || expanded.value);
    // 仅在展开状态吸顶：折叠的项目头部无需常驻，避免多个折叠头堆叠在顶部
    const stickyEnabled = computed(
      () => stickyHeader.value && expanded.value && !siderCollapsed.value,
    );
    return () => {
      const _className = className.value,
        _siderCollapsed = siderCollapsed.value,
        _stickyEnabled = stickyEnabled.value,
        _stickyTop = stickyTop.value,
        _tabIndex = tabIndex.value,
        _rowKey = rowKey.value,
        _expanded = expanded.value,
        _onToggle = onToggle.value,
        _header = header.value,
        _trailing = trailing.value,
        _showContent = showContent.value;
      return (
        <div class={classNames("workspace-collapse min-w-0", _className)}>
          {/* 折叠头部 - 侧栏折叠时隐藏。吸顶时外层用不透明 bg-2 作遮罩，
          内层的半透明 hover 高亮叠在遮罩上而非透出下方滚动内容。 */}
          {!_siderCollapsed && (
            <div
              class={classNames(
                _stickyEnabled && "sticky z-[9] bg-[var(--bg-2)]",
              )}
              style={
                _stickyEnabled
                  ? {
                      top: `${_stickyTop}px`,
                    }
                  : undefined
              }
            >
              {/* A button for the keyboard too: Tab reaches the header, Enter or Space folds or unfolds the project. Keys
              pressed on the buttons at its end bubble up here and are theirs. */}
              <div
                class="flex items-center gap-[6px] h-[30px] ps-[4px] pe-[8px] cursor-pointer hover:bg-fill-3 rounded-[6px] transition-colors min-w-0 group"
                role="button"
                tabindex={_tabIndex}
                data-roving-row={_rowKey}
                aria-expanded={_expanded}
                onClick={_onToggle}
                onKeydown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key !== "Enter" && event.key !== " ") return;
                  event.preventDefault();
                  _onToggle();
                }}
              >
                <span class="size-[22px] flex items-center justify-center shrink-0 text-t-primary">
                  {_expanded ? (
                    <FolderOpen
                      theme="outline"
                      size={16}
                      fill="currentColor"
                      class="leading-none"
                    />
                  ) : (
                    <FolderClose
                      theme="outline"
                      size={16}
                      fill="currentColor"
                      class="leading-none"
                    />
                  )}
                </span>

                {/* 标题内容 — flex 容器让内部 header span 的 truncate 生效 */}
                <div class="flex-1 min-w-0 flex items-center overflow-hidden">
                  {_header}
                </div>

                {/* 尾部操作保持自身宽度，让标题先截断。 */}
                {_trailing && (
                  <div
                    class="shrink-0 flex items-center justify-end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {_trailing}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 折叠内容 — row 保持全宽以便选中态 bg 填满整行；视觉缩进由 ConversationRow 的 dimIcon 分支自行处理 */}
          {_showContent && (
            <div class="workspace-collapse-content min-w-0">{children()}</div>
          )}
        </div>
      );
    };
  },
  {
    name: "WorkspaceCollapse",
    inheritAttrs: false,
    props: [
      "expanded",
      "onToggle",
      "header",
      "siderCollapsed",
      "trailing",
      "stickyHeader",
      "stickyTop",
      "rowKey",
      "tabIndex",
    ],
  },
);
export default WorkspaceCollapse;
