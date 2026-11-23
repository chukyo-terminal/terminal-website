import ReactModal from 'react-modal';

import type { JSX } from 'react';


/**
 * モーダルのプロパティを定義する。
 */
type ModalProperties = {
  isOpen: boolean;
  onRequestClose: () => void;
  contentLabel: string;
  children: React.ReactNode;
  /** モーダルの大きさ（既定は `'md'`）。`'lg'` は幅を広げ、画面に収まらない場合はスクロールする */
  size?: 'md' | 'lg';
};


/**
 * モーダルの大きさごとのクラス。
 */
const SIZE_CLASS_NAMES = {
  md: 'max-w-md',
  lg: 'max-w-2xl max-h-[90vh] overflow-y-auto',
} as const;


/**
 * モーダルコンポーネントを定義する。
 *
 * @param isOpen - モーダルが開いているかどうか
 * @param onRequestClose - モーダルを閉じるための関数
 * @param contentLabel - モーダルの内容を説明するラベル
 * @param children - モーダル内に表示するコンテンツ
 * @param size - モーダルの大きさ
 * @returns モーダルコンポーネント
 */
export default function Modal({
  isOpen,
  onRequestClose,
  contentLabel,
  children,
  size = 'md',
}: ModalProperties): JSX.Element {
  return (
    <ReactModal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      contentLabel={contentLabel}
      className={
        'fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-[90vw] p-4 bg-gray-800 rounded-lg '
        + `shadow-lg flex flex-col gap-2 ${SIZE_CLASS_NAMES[size]}`
      }
      overlayClassName="fixed inset-0 z-[100] bg-[rgba(55,65,81,0.8)] transition-opacity duration-300"
      closeTimeoutMS={300}
      ariaHideApp={false}
    >
      <span className="text-lg font-bold">{contentLabel}</span>
      {children}
    </ReactModal>
  );
}
