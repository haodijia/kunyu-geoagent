/**
 * Adapted from mu / AionUi. Copyright 2025 AionUi (aionui.com).
 * SPDX-License-Identifier: Apache-2.0
 * Kunyu adaptations: data access, localization, and Tailwind utility syntax.
 */
import { Modal } from "@arco-design/web-react";
import { Close } from "@icon-park/react";
import type { CSSProperties, ReactNode } from "react";
import { zhCN } from "@/locales/zh-CN";

interface AionModalProps {
  readonly visible: boolean;
  readonly style: CSSProperties;
  readonly header: { title: string; showClose: boolean; style: CSSProperties };
  readonly footer: ReactNode;
  readonly children: ReactNode;
  readonly onCancel: () => void;
}

export function AionModal({
  visible,
  style,
  header,
  footer,
  children,
  onCancel
}: AionModalProps) {
  return (
    <Modal
      visible={visible}
      title={null}
      closable={false}
      footer={null}
      onCancel={onCancel}
      className="aionui-modal"
      style={{
        ...style,
        borderRadius: "16px",
        maxWidth: "calc(100vw - 32px)",
        maxHeight: "calc(100vh - 32px)"
      }}
      getPopupContainer={() => document.body}
    >
      <div className="aionui-modal-wrapper" style={{ borderRadius: "16px" }}>
        <div
          className="flex items-center justify-between pb-[20px]"
          style={header.style}
        >
          <h3 className="m-0 text-[18px] font-medium text-t-primary">
            {header.title}
          </h3>
          {header.showClose && (
            <button
              onClick={onCancel}
              className="flex size-[32px] cursor-pointer items-center justify-center rounded-[8px] border-0 bg-transparent p-0 transition-colors duration-200 hover:bg-[var(--bg-2)] focus:outline-none"
              aria-label={zhCN.workspaceSidebar.close}
            >
              <Close size={20} fill="var(--bg-6)" />
            </button>
          )}
        </div>
        <div
          className="aionui-modal-body-content"
          style={{ background: "var(--dialog-fill-0)", overflow: "auto" }}
        >
          {children}
        </div>
        <div className="shrink-0 bg-transparent">{footer}</div>
      </div>
    </Modal>
  );
}
