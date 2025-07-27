import React, { useState, useEffect, createContext, useContext } from "react";
import { createClient } from "@supabase/supabase-js";

// Konfigurasi Supabase Anda
const supabaseUrl = "https://oqoloxizcmazlblusxob.supabase.co";
const supabaseAnonKey =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xb2xveGl6Y21hemxibHVzeG9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTM2MDY4OTgsImV4cCI6MjA2OTE4Mjg5OH0.etLxNsm3-QLsUwwKm-eZvKyfdw4jBuv4NwCaioX-c4g";

// Inisialisasi klien Supabase
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Membuat Context untuk Supabase dan data aplikasi
const AppContext = createContext();

// Provider untuk Context Aplikasi
const AppProvider = ({ children }) => {
  const [couponBatches, setCouponBatches] = useState([]); // Mengganti 'coupons' menjadi 'couponBatches'
  const [sales, setSales] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("dashboard"); // 'dashboard', 'batches', 'add-batch', 'record-sale', 'add-deposit'

  // Fungsi untuk mengambil data dari Supabase
  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: batchesData, error: batchesError } = await supabase
        .from("coupons") // Nama tabel tetap 'coupons' di DB, tapi di app kita sebut 'batches'
        .select("*")
        .order("head_number", { ascending: true });

      const { data: salesData, error: salesError } = await supabase
        .from("sales")
        .select("*")
        .order("sale_date", { ascending: false });

      const { data: depositsData, error: depositsError } = await supabase
        .from("deposits")
        .select("*")
        .order("deposit_date", { ascending: false });

      if (batchesError) throw batchesError;
      if (salesError) throw salesError;
      if (depositsError) throw depositsError;

      setCouponBatches(batchesData);
      setSales(salesData);
      setDeposits(depositsData);
    } catch (err) {
      console.error("Error fetching data:", err.message);
      setError("Gagal memuat data: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Fungsi untuk menambahkan batch kupon baru
  const addCouponBatch = async (headNumber, batchQuantity) => {
    setLoading(true);
    setError(null);
    try {
      // Menghitung start_individual_number dan end_individual_number
      // Asumsi: head_number "901" berarti kupon 901-1 sampai 901-batchQuantity
      // Atau, jika head_number adalah awalan dan individual number dimulai dari 1
      const startIndividualNumber = 1;
      const endIndividualNumber = batchQuantity;

      const { data, error: insertError } = await supabase
        .from("coupons")
        .insert({
          head_number: headNumber,
          start_individual_number: startIndividualNumber,
          end_individual_number: endIndividualNumber,
          initial_quantity: batchQuantity,
          current_quantity: batchQuantity, // Saat ditambahkan, current_quantity = initial_quantity
          last_sold_individual_number: 0, // Inisialisasi, belum ada yang terjual
          price_per_coupon: 2500,
        })
        .select();

      if (insertError) throw insertError;

      setCouponBatches((prevBatches) => [...prevBatches, ...data]);
      return true; // Berhasil
    } catch (err) {
      console.error("Error adding coupon batch:", err.message);
      setError("Gagal menambahkan batch kupon: " + err.message);
      return false; // Gagal
    } finally {
      setLoading(false);
    }
  };

  // Fungsi untuk mencatat penjualan kupon dari sebuah batch
  const recordSale = async (batchId, quantitySold) => {
    setLoading(true);
    setError(null);
    try {
      const batch = couponBatches.find((b) => b.id === batchId);
      if (!batch) {
        throw new Error("Batch kupon tidak ditemukan.");
      }
      if (batch.current_quantity < quantitySold) {
        throw new Error("Kuantitas yang dijual melebihi stok yang tersedia.");
      }

      // Menghasilkan nomor kupon spesifik yang terjual
      const soldCouponNumbers = [];
      let currentIndividualNumber = batch.last_sold_individual_number + 1;
      if (currentIndividualNumber === 0)
        currentIndividualNumber = batch.start_individual_number; // Jika belum ada yang terjual

      for (let i = 0; i < quantitySold; i++) {
        // Memastikan format nomor kupon 3 digit (misal: 901-001)
        soldCouponNumbers.push(
          `${batch.head_number}-${String(currentIndividualNumber).padStart(
            3,
            "0"
          )}`
        );
        currentIndividualNumber++;
      }

      // Perbarui current_quantity dan last_sold_individual_number di tabel `coupons`
      const { data: updatedBatch, error: updateError } = await supabase
        .from("coupons")
        .update({
          current_quantity: batch.current_quantity - quantitySold,
          last_sold_individual_number: currentIndividualNumber - 1, // Nomor terakhir yang baru saja terjual
        })
        .eq("id", batchId)
        .select();

      if (updateError) throw updateError;

      // Tambahkan entri penjualan ke tabel `sales`
      const { data: newSale, error: saleError } = await supabase
        .from("sales")
        .insert({
          coupon_batch_id: batchId,
          sold_quantity: quantitySold,
          sold_coupon_numbers: soldCouponNumbers,
          total_price: quantitySold * batch.price_per_coupon,
          sale_date: new Date().toISOString().split("T")[0], // Tanggal hari ini
        })
        .select();

      if (saleError) throw saleError;

      // Perbarui state lokal
      setCouponBatches((prevBatches) =>
        prevBatches.map((b) =>
          b.id === batchId ? { ...b, ...updatedBatch[0] } : b
        )
      );
      setSales((prevSales) => [newSale[0], ...prevSales]); // Tambahkan penjualan baru ke daftar

      return true; // Berhasil
    } catch (err) {
      console.error("Error recording sale:", err.message);
      setError("Gagal mencatat penjualan: " + err.message);
      return false; // Gagal
    } finally {
      setLoading(false);
    }
  };

  // Fungsi untuk mencatat setoran
  const addDeposit = async (amount) => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: insertError } = await supabase
        .from("deposits")
        .insert({
          amount: amount,
          deposit_date: new Date().toISOString().split("T")[0],
        })
        .select();

      if (insertError) throw insertError;

      setDeposits((prevDeposits) => [data[0], ...prevDeposits]);
      return true; // Berhasil
    } catch (err) {
      console.error("Error adding deposit:", err.message);
      setError("Gagal mencatat setoran: " + err.message);
      return false; // Gagal
    } finally {
      setLoading(false);
    }
  };

  return (
    <AppContext.Provider
      value={{
        couponBatches,
        sales,
        deposits,
        loading,
        error,
        fetchData,
        addCouponBatch,
        recordSale, // Fungsi baru
        addDeposit,
        activeTab,
        setActiveTab,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

// Komponen Navigasi
const Navbar = () => {
  const { setActiveTab } = useContext(AppContext);
  const [isOpen, setIsOpen] = useState(false); // State untuk mengontrol menu mobile

  const handleNavItemClick = (tab) => {
    setActiveTab(tab);
    setIsOpen(false); // Tutup menu mobile setelah item diklik
  };

  return (
    <nav className="bg-gradient-to-r from-blue-500 to-indigo-600 p-4 shadow-lg rounded-b-lg">
      <div className="container mx-auto flex justify-between items-center">
        <h1 className="text-white text-3xl font-bold font-inter">
          Manajemen Kupon Jalan Sehat
        </h1>

        {/* Tombol Hamburger untuk Mobile */}
        <div className="md:hidden">
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="text-white focus:outline-none"
          >
            <svg
              className="w-8 h-8"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              {isOpen ? (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M6 18L18 6M6 6l12 12"
                />
              ) : (
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              )}
            </svg>
          </button>
        </div>

        {/* Navigasi Desktop */}
        <div className="hidden md:flex space-x-4">
          <NavItem onClick={() => handleNavItemClick("dashboard")}>
            Dashboard
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("batches")}>
            Kupon (Batch)
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("add-batch")}>
            Tambah Batch Kupon
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("record-sale")}>
            Catat Penjualan
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("add-deposit")}>
            Catat Setoran
          </NavItem>
        </div>
      </div>

      {/* Menu Mobile (Muncul saat isOpen true) */}
      {isOpen && (
        <div className="md:hidden mt-4 space-y-2 flex flex-col items-center">
          <NavItem onClick={() => handleNavItemClick("dashboard")}>
            Dashboard
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("batches")}>
            Kupon (Batch)
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("add-batch")}>
            Tambah Batch Kupon
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("record-sale")}>
            Catat Penjualan
          </NavItem>
          <NavItem onClick={() => handleNavItemClick("add-deposit")}>
            Catat Setoran
          </NavItem>
        </div>
      )}
    </nav>
  );
};

const NavItem = ({ children, onClick }) => (
  <button
    onClick={onClick}
    className="text-white hover:text-blue-200 px-3 py-2 rounded-md text-lg font-medium transition duration-300 ease-in-out transform hover:scale-105 w-full md:w-auto text-center"
  >
    {children}
  </button>
);

// Komponen Dashboard
const Dashboard = () => {
  const { sales, deposits, couponBatches, loading, error } =
    useContext(AppContext);

  // Hitung total saldo yang didapatkan (dari semua penjualan)
  const totalSalesAmount = sales.reduce(
    (sum, sale) => sum + sale.total_price,
    0
  );

  // Hitung saldo yang sudah disetorkan
  const totalDepositedAmount = deposits.reduce(
    (sum, deposit) => sum + deposit.amount,
    0
  );

  // Hitung sisa saldo yang belum disetorkan
  const remainingBalance = totalSalesAmount - totalDepositedAmount;

  // Penjualan hari ini
  const today = new Date().toISOString().split("T")[0];
  const todaySales = sales.filter((sale) => sale.sale_date === today);

  // Total stok kupon yang tersedia dari semua batch
  const totalAvailableCoupons = couponBatches.reduce(
    (sum, batch) => sum + batch.current_quantity,
    0
  );

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-4xl font-extrabold text-gray-800 mb-8 text-center">
        Ringkasan Dashboard
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        <MetricCard
          title="Total Saldo Terkumpul"
          value={formatCurrency(totalSalesAmount)}
          icon="💰"
          color="bg-green-100 text-green-800"
        />
        <MetricCard
          title="Saldo Disetor ke Bendahara"
          value={formatCurrency(totalDepositedAmount)}
          icon="🏦"
          color="bg-blue-100 text-blue-800"
        />
        <MetricCard
          title="Sisa Saldo Belum Disetor"
          value={formatCurrency(remainingBalance)}
          icon="💸"
          color="bg-yellow-100 text-yellow-800"
        />
        <MetricCard
          title="Total Kupon Tersedia"
          value={`${totalAvailableCoupons} Kupon`}
          icon="🎟️"
          color="bg-purple-100 text-purple-800"
        />
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg mb-8">
        <h3 className="text-2xl font-semibold text-gray-800 mb-4">
          Penjualan Hari Ini ({formatDate(today)})
        </h3>
        {todaySales.length === 0 ? (
          <p className="text-gray-600">Belum ada penjualan hari ini.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">
                    Batch Kupon
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Kuantitas Terjual
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">
                    Total Harga
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Waktu Penjualan
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {todaySales.map((sale) => {
                  const batch = couponBatches.find(
                    (b) => b.id === sale.coupon_batch_id
                  );
                  return (
                    <tr key={sale.id}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {batch ? batch.head_number : "N/A"}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sale.sold_quantity}
                      </td>
                      {/* <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {sale.sold_coupon_numbers.join(', ')}
                      </td> */}
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatCurrency(sale.total_price)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatTime(sale.created_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="bg-white p-6 rounded-xl shadow-lg">
        <h3 className="text-2xl font-semibold text-gray-800 mb-4">
          Riwayat Setoran
        </h3>
        {deposits.length === 0 ? (
          <p className="text-gray-600">Belum ada setoran tercatat.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tl-lg">
                    Tanggal Setoran
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider rounded-tr-lg">
                    Jumlah
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {deposits.map((deposit) => (
                  <tr key={deposit.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {formatDate(deposit.deposit_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatCurrency(deposit.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const MetricCard = ({ title, value, icon, color }) => (
  <div
    className={`p-6 rounded-xl shadow-md flex items-center space-x-4 ${color}`}
  >
    <div className="text-4xl">{icon}</div>
    <div>
      <h4 className="text-lg font-medium text-gray-700">{title}</h4>
      <p className="text-3xl font-bold">{value}</p>
    </div>
  </div>
);

// Komponen Daftar Batch Kupon
const CouponBatchList = () => {
  const { couponBatches, sales, loading, error } = useContext(AppContext);
  const [selectedBatchId, setSelectedBatchId] = useState(null);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;

  const getBatchSalesHistory = (batchId) => {
    return sales
      .filter((sale) => sale.coupon_batch_id === batchId)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-4xl font-extrabold text-gray-800 mb-8 text-center">
        Daftar Batch Kupon
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {couponBatches.length === 0 ? (
          <p className="text-gray-600 col-span-full text-center">
            Tidak ada batch kupon yang terdaftar.
          </p>
        ) : (
          couponBatches.map((batch) => (
            <BatchCard
              key={batch.id}
              batch={batch}
              onViewHistory={() => setSelectedBatchId(batch.id)}
            />
          ))
        )}
      </div>

      {selectedBatchId && (
        // Perbaikan di sini: Mengubah BatchDetailMo menjadi BatchDetailModal
        <BatchDetailModal
          batch={couponBatches.find((b) => b.id === selectedBatchId)}
          history={getBatchSalesHistory(selectedBatchId)}
          onClose={() => setSelectedBatchId(null)}
        />
      )}
    </div>
  );
};

const BatchCard = ({ batch, onViewHistory }) => (
  <div
    className={`p-5 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105 ${
      batch.current_quantity > 0
        ? "bg-white border border-blue-200"
        : "bg-red-100 border border-red-300"
    }`}
  >
    <h4 className="text-xl font-bold text-gray-800 mb-2">
      Batch Kupon: {batch.head_number}
    </h4>
    <p className="text-gray-600 mb-1">
      Kuantitas Awal: {batch.initial_quantity}
    </p>
    <p className="text-gray-600 mb-1">
      Kuantitas Tersedia:{" "}
      <span
        className={`font-semibold ${
          batch.current_quantity > 0 ? "text-green-600" : "text-red-600"
        }`}
      >
        {batch.current_quantity}
      </span>
    </p>
    <p className="text-gray-600 mb-3">
      Harga per Kupon: {formatCurrency(batch.price_per_coupon)}
    </p>
    <div className="flex flex-col space-y-2">
      <button
        onClick={onViewHistory}
        className="bg-gray-200 hover:bg-gray-300 text-gray-800 font-bold py-2 px-4 rounded-lg shadow-md transition duration-300 ease-in-out transform hover:scale-105"
      >
        Lihat Riwayat Batch
      </button>
    </div>
  </div>
);

const BatchDetailModal = ({ batch, history, onClose }) => {
  if (!batch) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto transform transition-all duration-300 scale-100 opacity-100">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-3xl font-bold text-gray-800">
            Detail Batch: {batch.head_number}
          </h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-4xl font-bold transition duration-300 ease-in-out transform hover:scale-110"
          >
            &times;
          </button>
        </div>

        <p className="text-lg text-gray-700 mb-4">
          Rentang Kupon: {batch.head_number}-
          {String(batch.start_individual_number).padStart(3, "0")} s/d{" "}
          {batch.head_number}-
          {String(batch.end_individual_number).padStart(3, "0")}
        </p>
        <p className="text-lg text-gray-700 mb-4">
          Kuantitas Awal: {batch.initial_quantity}
        </p>
        <p className="text-lg text-gray-700 mb-4">
          Kuantitas Tersedia:{" "}
          <span
            className={`font-semibold ${
              batch.current_quantity > 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {batch.current_quantity}
          </span>
        </p>
        <p className="text-lg text-gray-700 mb-6">
          Harga per Kupon: {formatCurrency(batch.price_per_coupon)}
        </p>

        <h4 className="text-2xl font-semibold text-gray-800 mb-4 border-b pb-2">
          Riwayat Penjualan Batch Ini
        </h4>
        {history.length === 0 ? (
          <p className="text-gray-600">
            Belum ada riwayat penjualan untuk batch ini.
          </p>
        ) : (
          <ul className="space-y-3">
            {history.map((sale) => (
              <li
                key={sale.id}
                className="bg-gray-50 p-4 rounded-lg shadow-sm border border-gray-200"
              >
                <p className="text-gray-800 font-medium">
                  Tanggal Penjualan:{" "}
                  <span className="font-normal">
                    {formatDate(sale.sale_date)}
                  </span>
                </p>
                <p className="text-gray-800 font-medium">
                  Jumlah Terjual:{" "}
                  <span className="font-normal">
                    {sale.sold_quantity} kupon
                  </span>
                </p>
                <p className="text-gray-800 font-medium">
                  Total Harga:{" "}
                  <span className="font-normal">
                    {formatCurrency(sale.total_price)}
                  </span>
                </p>
                <p className="text-gray-800 font-medium">
                  Waktu:{" "}
                  <span className="font-normal">
                    {formatTime(sale.created_at)}
                  </span>
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

// Komponen Tambah Batch Kupon
const AddCouponBatchForm = () => {
  const { addCouponBatch, loading, error, setActiveTab } =
    useContext(AppContext);
  const [headNumber, setHeadNumber] = useState("");
  const [batchQuantity, setBatchQuantity] = useState(100); // Default 1000 kupon per batch
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // 'success' or 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setMessageType("");

    if (!headNumber.trim()) {
      setMessage("Nomor Kepala (Batch) tidak boleh kosong.");
      setMessageType("error");
      return;
    }
    if (batchQuantity < 1) {
      setMessage("Jumlah kupon dalam batch harus minimal 1.");
      setMessageType("error");
      return;
    }

    const success = await addCouponBatch(headNumber, batchQuantity);
    if (success) {
      setMessage(
        `Berhasil menambahkan batch kupon ${headNumber} dengan ${batchQuantity} kupon.`
      );
      setMessageType("success");
      setHeadNumber("");
      setBatchQuantity(1000);
      // Opsional: Langsung pindah ke halaman batch kupon setelah berhasil
      // setActiveTab('batches');
    } else {
      setMessage(error || "Terjadi kesalahan saat menambahkan batch kupon.");
      setMessageType("error");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-4xl font-extrabold text-gray-800 mb-8 text-center">
          Tambah Batch Kupon Baru
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="headNumber"
              className="block text-lg font-medium text-gray-700 mb-2"
            >
              Nomor Kepala (Batch)
            </label>
            <input
              type="text"
              id="headNumber"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              value={headNumber}
              onChange={(e) => setHeadNumber(e.target.value)}
              placeholder="Contoh: 901"
              required
            />
          </div>
          <div>
            <label
              htmlFor="batchQuantity"
              className="block text-lg font-medium text-gray-700 mb-2"
            >
              Jumlah Kupon dalam Batch Ini
            </label>
            <input
              type="number"
              id="batchQuantity"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              value={batchQuantity}
              onChange={(e) => setBatchQuantity(parseInt(e.target.value) || 1)}
              min="1"
              required
            />
          </div>
          {message && (
            <div
              className={`p-3 rounded-lg text-center ${
                messageType === "success"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {message}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-xl"
            disabled={loading}
          >
            {loading ? "Menambahkan..." : "Tambah Batch Kupon"}
          </button>
        </form>
      </div>
    </div>
  );
};

// Komponen Catat Penjualan
const RecordSaleForm = () => {
  const { couponBatches, recordSale, loading, error, setActiveTab } =
    useContext(AppContext);
  const [selectedBatchId, setSelectedBatchId] = useState("");
  // Perbaikan di sini: Inisialisasi quantitySold dengan string kosong untuk memungkinkan penghapusan
  const [quantitySold, setQuantitySold] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // 'success' or 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setMessageType("");

    if (!selectedBatchId) {
      setMessage("Pilih batch kupon.");
      setMessageType("error");
      return;
    }

    // Pastikan quantitySold adalah angka yang valid dan lebih dari 0
    const parsedQuantitySold = parseInt(quantitySold);
    if (isNaN(parsedQuantitySold) || parsedQuantitySold < 1) {
      setMessage("Jumlah kupon yang dijual harus angka positif.");
      setMessageType("error");
      return;
    }

    const success = await recordSale(selectedBatchId, parsedQuantitySold); // Gunakan parsedQuantitySold
    if (success) {
      setMessage(
        `Berhasil mencatat penjualan ${parsedQuantitySold} kupon dari batch.`
      );
      setMessageType("success");
      setSelectedBatchId("");
      setQuantitySold(""); // Reset ke string kosong setelah berhasil
      // Opsional: Langsung pindah ke halaman dashboard setelah berhasil
      // setActiveTab('dashboard');
    } else {
      setMessage(error || "Terjadi kesalahan saat mencatat penjualan.");
      setMessageType("error");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-4xl font-extrabold text-gray-800 mb-8 text-center">
          Catat Penjualan Kupon
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="batchSelect"
              className="block text-lg font-medium text-gray-700 mb-2"
            >
              Pilih Batch Kupon
            </label>
            <select
              id="batchSelect"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              value={selectedBatchId}
              onChange={(e) => setSelectedBatchId(e.target.value)}
              required
            >
              <option value="">-- Pilih Batch --</option>
              {couponBatches
                .filter((batch) => batch.current_quantity > 0)
                .map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.head_number} (Tersedia: {batch.current_quantity})
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="quantitySold"
              className="block text-lg font-medium text-gray-700 mb-2"
            >
              Jumlah Kupon Terjual
            </label>
            <input
              type="number"
              id="quantitySold"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              value={quantitySold}
              // Perbaikan di sini:
              onChange={(e) => {
                const value = e.target.value;
                // Izinkan string kosong untuk memungkinkan pengguna menghapus angka
                // Jika bukan angka valid, set ke string kosong. Jika angka, set ke angka.
                setQuantitySold(value === "" ? "" : parseInt(value));
              }}
              min="1" // Atribut min HTML masih berfungsi untuk validasi browser
              required
            />
          </div>
          {message && (
            <div
              className={`p-3 rounded-lg text-center ${
                messageType === "success"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {message}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-xl"
            disabled={loading}
          >
            {loading ? "Mencatat..." : "Catat Penjualan"}
          </button>
        </form>
      </div>
    </div>
  );
};

// Komponen Catat Setoran
const AddDepositForm = () => {
  const { addDeposit, loading, error, setActiveTab } = useContext(AppContext);
  const [amount, setAmount] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState(""); // 'success' or 'error'

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage("");
    setMessageType("");

    const depositAmount = parseFloat(amount);
    if (isNaN(depositAmount) || depositAmount <= 0) {
      setMessage("Jumlah setoran harus angka positif.");
      setMessageType("error");
      return;
    }

    const success = await addDeposit(depositAmount);
    if (success) {
      setMessage(
        `Berhasil mencatat setoran sebesar ${formatCurrency(depositAmount)}.`
      );
      setMessageType("success");
      setAmount("");
      // Opsional: Langsung pindah ke halaman dashboard setelah berhasil
      // setActiveTab('dashboard');
    } else {
      setMessage(error || "Terjadi kesalahan saat mencatat setoran.");
      setMessageType("error");
    }
  };

  return (
    <div className="p-6 bg-gray-50 min-h-screen flex items-center justify-center">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md">
        <h2 className="text-4xl font-extrabold text-gray-800 mb-8 text-center">
          Catat Setoran ke Bendahara
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label
              htmlFor="amount"
              className="block text-lg font-medium text-gray-700 mb-2"
            >
              Jumlah Setoran (Rp)
            </label>
            <input
              type="number"
              id="amount"
              className="mt-1 block w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Contoh: 50000"
              required
              min="0"
              step="any"
            />
          </div>
          {message && (
            <div
              className={`p-3 rounded-lg text-center ${
                messageType === "success"
                  ? "bg-green-100 text-green-800"
                  : "bg-red-100 text-red-800"
              }`}
            >
              {message}
            </div>
          )}
          <button
            type="submit"
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg shadow-lg transition duration-300 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed text-xl"
            disabled={loading}
          >
            {loading ? "Mencatat..." : "Catat Setoran"}
          </button>
        </form>
      </div>
    </div>
  );
};

// Utilitas
const formatCurrency = (amount) => {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatDate = (dateString) => {
  if (!dateString) return "N/A";
  const options = { year: "numeric", month: "long", day: "numeric" };
  return new Date(dateString).toLocaleDateString("id-ID", options);
};

const formatTime = (dateTimeString) => {
  if (!dateTimeString) return "N/A";
  const options = {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  };
  return new Date(dateTimeString).toLocaleTimeString("id-ID", options);
};

const LoadingSpinner = () => (
  <div className="flex justify-center items-center min-h-screen bg-gray-50">
    <div className="animate-spin rounded-full h-32 w-32 border-t-4 border-b-4 border-blue-500"></div>
    <p className="ml-4 text-xl text-gray-700">Memuat data...</p>
  </div>
);

const ErrorMessage = ({ message }) => (
  <div className="flex justify-center items-center min-h-screen bg-red-50">
    <div
      className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative"
      role="alert"
    >
      <strong className="font-bold">Error!</strong>
      <span className="block sm:inline ml-2">{message}</span>
    </div>
  </div>
);

// Komponen baru untuk menampung konten utama aplikasi
const AppContent = () => {
  const { activeTab } = useContext(AppContext);

  return (
    <>
      {activeTab === "dashboard" && <Dashboard />}
      {activeTab === "batches" && <CouponBatchList />}
      {activeTab === "add-batch" && <AddCouponBatchForm />}
      {activeTab === "record-sale" && <RecordSaleForm />}
      {activeTab === "add-deposit" && <AddDepositForm />}
    </>
  );
};

// Komponen Utama Aplikasi
export default function App() {
  return (
    <AppProvider>
      <div className="font-inter antialiased bg-gray-100">
        <Navbar />
        <main>
          <AppContent />
        </main>
      </div>
    </AppProvider>
  );
}
