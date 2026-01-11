import TransactionItem from "@/types/TransactionItem";

type Transaction = {
  id: string;
  customerId: string;
  items: TransactionItem[];
  date: string;
  cashPayment: number;
  onlinePayment: number;
  deliveryFee: number;
  discount: number;
  freebies: number;
};

export default Transaction;
