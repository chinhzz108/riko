import {
  BookOpen,
  Check,
  ChevronRight,
  QrCode,
  ShieldCheck,
} from "lucide-react"
import { Link } from "react-router"
import BookCollection from "./BookCollection"

export default function BookCatalog() {
  return (
    <div className="mx-auto max-w-[1240px] px-4 pb-12 pt-7 sm:px-6 lg:px-10">
      <nav
        aria-label="Đường dẫn"
        className="mb-8 flex items-center gap-2 text-xs font-medium text-[#717987] sm:text-sm"
      >
        <Link to="/" className="transition hover:text-primary">
          Trang chủ
        </Link>
        <ChevronRight size={14} aria-hidden="true" />
        <span aria-current="page" className="font-semibold text-primary">
          Sách Riko
        </span>
      </nav>

      <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-2xl">
          <p className="text-[11px] font-bold uppercase tracking-[.18em] text-[#667896]">
            Tủ sách của nhà thám hiểm nhỏ
          </p>
          <h1 className="mt-3 text-[34px] leading-tight tracking-[-.035em] sm:text-[42px]">
            Chọn sách <span className="text-[#D75A3D]">bé yêu thích.</span>
          </h1>
          <p className="mt-4 max-w-xl text-sm font-medium leading-7 text-[#606A79]">
            Phương tiện, động vật hay thiên nhiên? Chọn một quyển hoặc trọn bộ 3
            quyển để xem chi tiết và đặt trước cùng Riko.
          </p>
        </div>
        <ol
          aria-label="Các bước đặt sách"
          className="grid w-full grid-cols-3 gap-3 text-xs font-semibold text-[#7C8491] sm:flex sm:w-auto sm:items-center sm:gap-x-4"
        >
          <li
            aria-current="step"
            className="flex flex-col items-center gap-2 text-primary sm:flex-row"
          >
            <span className="flex size-6 items-center justify-center rounded-full bg-primary text-[11px] text-white">
              1
            </span>{" "}
            Chọn sách
          </li>
          <li className="flex flex-col items-center gap-2 sm:flex-row">
            <ChevronRight
              size={13}
              aria-hidden="true"
              className="mr-2 hidden sm:block"
            />
            <span className="flex size-6 items-center justify-center rounded-full border border-primary/15 bg-white">
              2
            </span>{" "}
            Xem chi tiết
          </li>
          <li className="flex flex-col items-center gap-2 sm:flex-row">
            <ChevronRight
              size={13}
              aria-hidden="true"
              className="mr-2 hidden sm:block"
            />
            <span className="flex size-6 items-center justify-center rounded-full border border-primary/15 bg-white">
              3
            </span>{" "}
            Đặt trước
          </li>
        </ol>
      </div>

      <section aria-label="Chọn sách hoặc combo">
        <BookCollection includeCombo actionLabel="Chọn sách" />
      </section>

      <div className="mt-8 grid gap-5 rounded-2xl border border-primary/10 bg-white/60 px-6 py-5 text-xs font-semibold text-[#606A79] sm:grid-cols-3">
        <span className="flex items-center gap-3">
          <ShieldCheck
            size={21}
            strokeWidth={1.6}
            className="shrink-0 text-[#56865A]"
          />{" "}
          Nội dung chọn lọc cho trẻ 6–12 tuổi
        </span>
        <span className="flex items-center gap-3">
          <QrCode
            size={21}
            strokeWidth={1.6}
            className="shrink-0 text-[#537CAE]"
          />{" "}
          Sách giấy kết hợp video và quiz
        </span>
        <span className="flex items-center gap-3">
          <Check
            size={21}
            strokeWidth={1.6}
            className="shrink-0 text-[#C58B3D]"
          />{" "}
          Xác nhận đơn trước khi giao sách
        </span>
      </div>
      <div className="mt-7 flex flex-wrap items-center justify-center gap-2 text-sm font-medium text-[#606A79]">
        <BookOpen size={17} className="text-primary" /> Muốn khám phá trước khi
        chọn?
        <Link
          to="/preview"
          className="font-bold text-primary underline underline-offset-4"
        >
          Đọc thử cùng Riko
        </Link>
      </div>
    </div>
  )
}
