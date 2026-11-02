import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronRight,
  Gamepad2,
  Package,
  QrCode,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
} from "lucide-react"
import { Link } from "react-router"
import type { ReactNode } from "react"
import { bookProducts, type BookProduct } from "../data/bookProducts"
import BookArtwork from "./BookArtwork"
import BookCollection from "./BookCollection"

const money = (value: number) => `${value.toLocaleString("vi-VN")}đ`
const singleBookTotal = bookProducts
  .filter((book) => !book.isCombo)
  .reduce((total, book) => total + book.price, 0)

export default function BookShop({
  product,
  quantityControl,
  onSelect,
  onAddToCart,
  onCheckout,
}: {
  product: BookProduct
  quantityControl: ReactNode
  onSelect: (id: string) => void
  onAddToCart: () => void
  onCheckout: () => void
}) {
  const saving = product.isCombo ? singleBookTotal - product.price : 0
  const selectFromCollection = (id: string) => {
    onSelect(id)
    document.getElementById("book-order")?.scrollIntoView({ block: "start" })
  }

  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-8 pt-7 sm:px-6 lg:px-10">
      <nav
        aria-label="Đường dẫn"
        className="mb-7 flex items-center gap-2 text-xs font-medium text-[#717987] sm:text-sm"
      >
        <Link to="/" className="transition hover:text-primary">
          Trang chủ
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page" className="font-semibold text-primary">
          Sách Riko
        </span>
      </nav>

      <section
        id="book-order"
        aria-label="Chi tiết và đặt trước sách"
        className="grid scroll-mt-28 items-start gap-8 lg:grid-cols-[1.08fr_1fr] lg:gap-12"
      >
        <div className="overflow-hidden rounded-[28px] border border-primary/10 bg-white p-3 sm:p-4">
          <div className="flex items-center justify-between px-2 pb-3 pt-1 text-[10px] font-bold uppercase tracking-[.16em] text-[#68758C] sm:text-[11px]">
            <span>Rikokid · Explore, learn, grow</span>
            <span className="text-primary">
              {product.isCombo ? "Bộ 03 quyển" : product.chapter}
            </span>
          </div>
          <BookArtwork
            productId={product.id}
            priority
            className="aspect-[1.15] rounded-[20px]"
          />
          <p className="px-2 pb-1 pt-4 text-center text-xs font-medium leading-5 text-[#68758C]">
            {product.isCombo
              ? "Phương tiện · Động vật · Hiện tượng thiên nhiên"
              : `Bìa sách ${product.title} · Khám phá cùng Riko`}
          </p>
          <div className="mt-4 grid grid-cols-3 divide-x divide-primary/10 border-t border-primary/10 pb-1 pt-5 text-center text-[11px] font-semibold leading-5 text-primary sm:text-xs">
            <span className="flex flex-col items-center gap-1.5">
              <BookOpen size={19} strokeWidth={1.7} /> Sách in màu
            </span>
            <span className="flex flex-col items-center gap-1.5">
              <QrCode size={19} strokeWidth={1.7} /> QR & video
            </span>
            <span className="flex flex-col items-center gap-1.5">
              <Gamepad2 size={19} strokeWidth={1.7} /> Quiz tương tác
            </span>
          </div>
        </div>

        <div className="min-w-0 pt-1">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#667896]">
            <Sparkles size={15} className="text-[#E28A26]" /> Bộ sách khám phá
            cùng Riko
          </p>
          <h1 className="mt-4 text-[34px] leading-[1.2] tracking-[-.035em] sm:text-[40px]">
            {product.isCombo ? (
              <>
                Ba quyển sách nhỏ.
                <br />
                <span className="text-[#D75A3D]">Cả thế giới mở ra.</span>
              </>
            ) : (
              product.title
            )}
          </h1>
          <p className="mt-4 text-sm font-medium leading-6 text-[#606A79]">
            {product.description}
          </p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span className="text-[34px] font-bold leading-none tracking-tight text-primary">
              {money(product.price)}
            </span>
            {product.compareAt && (
              <span className="text-sm text-[#7C8491] line-through">
                {money(product.compareAt)}
              </span>
            )}
            {saving > 0 && (
              <span className="rounded-md bg-[#E9F3E8] px-2.5 py-1.5 text-xs font-bold text-[#39703D]">
                Tiết kiệm {money(saving)}
              </span>
            )}
          </div>
          <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-[#8D5C21]">
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full bg-[#E5A240]"
            />{" "}
            Đang nhận đặt trước
          </p>

          <fieldset className="mt-6 border-t border-primary/10 pt-5">
            <legend className="float-left w-full pb-3 text-xs font-bold text-[#47546B]">
              Chọn phiên bản
            </legend>
            <div className="grid clear-both grid-cols-2 gap-2.5">
              {bookProducts.map((option) => {
                const selected = option.id === product.id
                return (
                  <button
                    key={option.id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => onSelect(option.id)}
                    className={`relative flex min-h-[72px] items-center gap-2 rounded-xl border px-3 py-3 text-left transition ${
                      selected
                        ? "border-primary bg-[#EEF1FB] shadow-[inset_0_0_0_1px_#374BA0]"
                        : "border-primary/15 bg-white hover:border-primary/50 hover:bg-primary/[.025]"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${
                        selected
                          ? "border-primary bg-primary text-white"
                          : "border-[#CBD0DC]"
                      }`}
                    >
                      {selected && <Check size={11} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-xs font-bold leading-5 text-primary">
                        {option.isCombo ? "Trọn bộ 3 quyển" : option.title}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-medium text-[#68758C]">
                        {money(option.price)}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </fieldset>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs font-bold text-[#47546B]">
              Số lượng {product.isCombo ? "bộ" : "quyển"}
            </span>
            {quantityControl}
          </div>
          <div className="mt-4 grid grid-cols-[1fr_1.15fr] gap-2.5">
            <button
              type="button"
              onClick={onAddToCart}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full border border-primary/25 bg-white px-3 py-3 text-sm font-bold text-primary transition hover:border-primary hover:bg-primary/5"
            >
              <ShoppingBag size={17} /> Thêm vào giỏ
            </button>
            <Link
              to="/checkout"
              onClick={onCheckout}
              className="inline-flex min-h-13 items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-bold text-white shadow-[0_6px_16px_#374BA025] transition hover:-translate-y-0.5 hover:bg-[#293D91]"
            >
              Đặt trước ngay <ArrowRight size={17} />
            </Link>
          </div>
          <p className="mt-3 text-[11px] font-medium leading-5 text-[#717987]">
            Rikokid sẽ liên hệ xác nhận đơn và thời gian giao sách.
          </p>
        </div>
      </section>

      <div className="my-10 grid gap-5 rounded-2xl border border-primary/10 bg-white/60 px-6 py-5 text-xs font-semibold text-[#606A79] sm:grid-cols-3 sm:gap-4 sm:px-7">
        <span className="flex items-center gap-3">
          <ShieldCheck
            size={22}
            strokeWidth={1.6}
            className="shrink-0 text-[#56865A]"
          />
          <span>
            Nội dung chọn lọc
            <br />
            <b className="font-bold text-primary">Dành cho trẻ 6–12 tuổi</b>
          </span>
        </span>
        <span className="flex items-center gap-3">
          <Package
            size={22}
            strokeWidth={1.6}
            className="shrink-0 text-[#C58B3D]"
          />
          <span>
            Đặt trước cùng Rikokid
            <br />
            <b className="font-bold text-primary">Xác nhận trước khi giao</b>
          </span>
        </span>
        <Link to="/scan" className="group flex items-center gap-3">
          <QrCode
            size={22}
            strokeWidth={1.6}
            className="shrink-0 text-[#537CAE]"
          />
          <span>
            Có sẵn sách trên tay?
            <br />
            <b className="inline-flex items-center gap-1 font-bold text-primary">
              Trải nghiệm AR{" "}
              <ArrowRight
                size={13}
                className="transition-transform group-hover:translate-x-1"
              />
            </b>
          </span>
        </Link>
      </div>

      <section
        className="pb-12 pt-5 sm:pt-8"
        aria-labelledby="book-collection-title"
      >
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#667896]">
              Mỗi sở thích, một cuộc phiêu lưu
            </p>
            <h2
              id="book-collection-title"
              className="mt-2 text-3xl tracking-tight"
            >
              Bé muốn khám phá điều gì?
            </h2>
          </div>
          <p className="text-xs font-medium text-[#717987]">
            Ba chủ đề · Cùng một người bạn Riko
          </p>
        </div>
        <BookCollection
          selectedId={product.id}
          onSelect={selectFromCollection}
        />
        <button
          type="button"
          onClick={() => selectFromCollection("combo3")}
          className="group mt-5 flex w-full flex-wrap items-center justify-between gap-4 rounded-2xl border border-[#E8DAB9] bg-[#FFF5DF] px-5 py-5 text-left transition hover:border-[#D8B772] sm:px-7"
        >
          <span className="flex items-center gap-4">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-white/75 text-[#B98028]">
              <Package size={23} strokeWidth={1.6} />
            </span>
            <span>
              <span className="block text-base font-bold text-primary">
                Thêm nhiều khám phá với trọn bộ 3 quyển
              </span>
              <span className="mt-1 block text-xs font-medium text-[#806D4D]">
                799.000đ / bộ · Tiết kiệm 98.000đ so với mua lẻ
              </span>
            </span>
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-bold text-primary">
            {product.isCombo ? "Đang chọn trọn bộ" : "Chọn trọn bộ"}{" "}
            <ArrowRight
              size={17}
              className="transition-transform group-hover:translate-x-1"
            />
          </span>
        </button>
      </section>

      <section className="mb-8 grid gap-8 rounded-[28px] bg-[#EDF1FA] px-6 py-8 sm:px-8 lg:grid-cols-[.8fr_1.6fr] lg:gap-12 lg:p-10">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#667896]">
            Đọc · Xem · Chơi
          </p>
          <h2 className="mt-3 text-3xl leading-tight tracking-tight">
            Từ trang sách,
            <br />
            đến những điều kỳ diệu.
          </h2>
          <Link
            to="/preview"
            className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-primary hover:underline"
          >
            Đọc thử cùng Riko <ArrowRight size={16} />
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-3">
          {[
            {
              icon: BookOpen,
              title: "Mở sách",
              text: "Bắt đầu bằng những hình ảnh và câu chuyện đầy màu sắc.",
            },
            {
              icon: QrCode,
              title: "Quét & xem",
              text: "Quét QR để câu chuyện tiếp tục qua những video sinh động.",
            },
            {
              icon: Gamepad2,
              title: "Chơi & ghi nhớ",
              text: "Thử sức với quiz, lưu lại những điều mới bé vừa học được.",
            },
          ].map((step, index) => (
            <div key={step.title}>
              <div className="mb-4 flex items-center justify-between">
                <step.icon
                  size={25}
                  strokeWidth={1.6}
                  className="text-primary"
                />
                <span className="text-xs font-bold text-primary/35">
                  0{index + 1}
                </span>
              </div>
              <h3 className="text-base">{step.title}</h3>
              <p className="mt-2 text-xs font-medium leading-6 text-[#606A79]">
                {step.text}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
