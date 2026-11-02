export type BookProduct = {
  id: "vehicles" | "animals" | "nature" | "combo3"
  title: string
  description: string
  chapter: string
  cover: string
  price: number
  compareAt?: number
  isCombo?: boolean
}

export const bookProducts: BookProduct[] = [
  {
    id: "vehicles",
    title: "Phương tiện",
    description:
      "Cùng Riko tìm hiểu những phương tiện và cách chúng chuyển động quanh ta.",
    chapter: "Chương 1",
    cover: "/images/covers/vehicles.webp",
    price: 299_000,
    compareAt: 350_000,
  },
  {
    id: "animals",
    title: "Động vật",
    description:
      "Gặp gỡ những người bạn đáng yêu và khám phá thế giới động vật đầy màu sắc.",
    chapter: "Chương 2",
    cover: "/images/covers/animals.webp",
    price: 299_000,
    compareAt: 350_000,
  },
  {
    id: "nature",
    title: "Hiện tượng thiên nhiên",
    description:
      "Khơi gợi những câu hỏi về mưa nắng, bầu trời và bao điều kỳ thú trong tự nhiên.",
    chapter: "Chương 3",
    cover: "/images/covers/nature.webp",
    price: 299_000,
    compareAt: 350_000,
  },
  {
    id: "combo3",
    title: "Combo đủ 3 quyển",
    description:
      "Trọn bộ Phương tiện, Động vật và Hiện tượng thiên nhiên. Ba chủ đề để bé thỏa sức khám phá cùng Riko.",
    chapter: "Trọn bộ",
    cover: "/images/covers/vehicles.webp",
    price: 799_000,
    isCombo: true,
  },
]

export const getBookProduct = (id: string) =>
  bookProducts.find((product) => product.id === id) || bookProducts[0]

export const orderCodeProductId = (orderCode: string) => {
  const code = orderCode.split("-").pop()?.toLowerCase()
  if (code === "combo3") return "combo3"
  if (code === "animals" || code === "nature" || code === "vehicles")
    return code
  return null
}
