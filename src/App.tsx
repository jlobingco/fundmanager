import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Search, 
  LayoutDashboard, 
  History, 
  HandCoins, 
  CreditCard, 
  Trash2, 
  Edit2, 
  ChevronRight, 
  ArrowUpRight, 
  ArrowDownLeft,
  AlertCircle,
  CheckCircle2,
  X,
  Download,
  Copy,
  Check,
  Filter,
  Calendar,
  Wallet,
  Coins
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng, toBlob } from 'html-to-image';
import jsPDF from 'jspdf';

// --- Types ---

interface Member {
  id: number;
  name: string;
  slots: number;
  status: string;
  joined_at: string;
  stats?: {
    principal: number;
    dividendShare: number;
    guarantorInterest: number;
    outstandingDebt: number;
    currentPrincipalDebt: number;
    totalLoanAmount: number;
    totalGuaranteedAmount: number;
    annualFees: number;
    annualFeePaidThisYear: boolean;
    monthsContributed: number;
    expectedReceivable: number;
  };
}

interface Transaction {
  id: number;
  member_id: number;
  amount: number;
  type: 'Contribution' | 'AnnualFee' | 'Penalty' | 'Refund';
  period: '15th' | '30th';
  month: string;
  date: string;
}

interface Loan {
  id: number;
  member_id: number | null;
  guarantor_id: number;
  borrower_name: string | null;
  debtor_name: string;
  guarantor_name: string;
  principal: number;
  interest_rate: number;
  months: number;
  status: 'Pending' | 'Active' | 'Paid' | 'Rejected';
  created_at: string;
  due_at: string;
  totalInterest: number;
  biMonthlyPayment: number;
  amountPaid: number;
  remainingBalance: number;
}

interface Summary {
  cashOnHand: number;
  totalPortfolio: number;
  dividendPool: number;
  totalGuarantorRewards: number;
  totalPenalties: number;
  totalMembers: number;
  totalSlots: number;
}

// --- Components ---

const Card = ({ children, className = "", id, onClick }: { children: React.ReactNode, className?: string, id?: string, onClick?: () => void, key?: React.Key }) => (
  <div 
    id={id} 
    onClick={onClick}
    className={`bg-[#1E293B] border border-white/10 rounded-2xl p-6 shadow-xl ${className} ${onClick ? 'cursor-pointer' : ''}`}
  >
    {children}
  </div>
);

const StatCard = ({ title, value, icon: Icon, color, format = 'currency' }: { title: string, value: number, icon: any, color: string, format?: 'currency' | 'number' }) => (
  <Card className="flex items-center gap-4">
    <div className={`p-3 rounded-xl ${color} bg-opacity-20`}>
      <Icon className={`w-6 h-6 ${color.replace('bg-', 'text-')}`} />
    </div>
    <div>
      <p className="text-slate-400 text-sm font-medium">{title}</p>
      <h3 className="text-2xl font-bold mt-1">
        {format === 'currency' 
          ? new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(value) 
          : value.toLocaleString()}
      </h3>
    </div>
  </Card>
);

const Modal = ({ isOpen, onClose, title, children }: { isOpen: boolean, onClose: () => void, title: string, children: React.ReactNode }) => (
  <AnimatePresence>
    {isOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />
        <motion.div 
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative bg-[#0F172A] border border-white/10 rounded-3xl w-full max-w-md overflow-hidden shadow-2xl"
        >
          <div className="p-6 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-xl font-bold">{title}</h2>
            <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
              <X className="w-5 h-5 text-slate-400" />
            </button>
          </div>
          <div className="p-6">
            {children}
          </div>
        </motion.div>
      </div>
    )}
  </AnimatePresence>
);

export default function App() {
  const [view, setView] = useState<'dashboard' | 'members' | 'loans' | 'history'>('dashboard');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loans, setLoans] = useState<Loan[]>([]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [contributionHistory, setContributionHistory] = useState<Transaction[]>([]);
  const [allContributions, setAllContributions] = useState<Transaction[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddContributionOpen, setIsAddContributionOpen] = useState(false);
  const [isAddLoanOpen, setIsAddLoanOpen] = useState(false);
  const [isBorrowerMember, setIsBorrowerMember] = useState(true);
  const [isPayLoanOpen, setIsPayLoanOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [contractLoan, setContractLoan] = useState<Loan | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);

  // Form States
  const [newMember, setNewMember] = useState({ name: '', slots: 1 });
  const [newContribution, setNewContribution] = useState({ 
    member_id: '', 
    amount: 0, 
    isFirstOfYear: false, 
    period: '15th' as '15th' | '30th',
    month: new Date().toISOString().slice(0, 7)
  });
  const [newLoan, setNewLoan] = useState({ 
    member_id: '', 
    borrower_name: '', 
    guarantor_id: '', 
    amount: 0, 
    months: 1 
  });
  const [loanPayment, setLoanPayment] = useState({ loan_id: '', amount: 0 });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setIsLoading(true);
    try {
      const [sumRes, memRes, loanRes, histRes] = await Promise.all([
        fetch('/api/summary'),
        fetch('/api/members'),
        fetch('/api/loans'),
        fetch('/api/contributions/all')
      ]);

      setSummary(await sumRes.json());
      setMembers(await memRes.json());
      setLoans(await loanRes.json());
      setAllContributions(await histRes.json());
    } catch (error) {
      console.error("Error fetching data:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectMember = async (member: Member) => {
    try {
      const [detRes, histRes] = await Promise.all([
        fetch(`/api/members/${member.id}`),
        fetch(`/api/members/${member.id}/contributions`)
      ]);
      setSelectedMember(await detRes.json());
      setContributionHistory(await histRes.json());
    } catch (error) {
      console.error("Error fetching member details:", error);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMember)
      });
      if (res.ok) {
        setIsAddMemberOpen(false);
        setNewMember({ name: '', slots: 1 });
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (error) {
      console.error("Error adding member:", error);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    try {
      await fetch(`/api/members/${memberToDelete.id}`, { method: 'DELETE' });
      setIsDeleteConfirmOpen(false);
      setMemberToDelete(null);
      if (selectedMember?.id === memberToDelete.id) setSelectedMember(null);
      fetchData();
    } catch (error) {
      console.error("Error deleting member:", error);
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/contributions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newContribution)
      });
      if (res.ok) {
        setIsAddContributionOpen(false);
        setNewContribution({ ...newContribution, amount: 0 });
        fetchData();
        if (selectedMember && Number(newContribution.member_id) === selectedMember.id) {
          handleSelectMember(selectedMember);
        }
      }
    } catch (error) {
      console.error("Error adding contribution:", error);
    }
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newLoan)
      });
      if (res.ok) {
        const data = await res.json();
        
        // Prepare loan data for contract generation
        const borrower = members.find(m => m.id === Number(newLoan.member_id));
        const guarantor = members.find(m => m.id === Number(newLoan.guarantor_id));
        const principal = Number(newLoan.amount);
        const months = Number(newLoan.months);
        const totalInterest = principal * 0.06 * months;
        const totalToPay = principal + totalInterest;
        const biMonthlyPayment = totalToPay / (months * 2);

        const tempLoan: Loan = {
          id: data.id,
          member_id: newLoan.member_id ? Number(newLoan.member_id) : null,
          guarantor_id: Number(newLoan.guarantor_id),
          borrower_name: newLoan.borrower_name || null,
          debtor_name: borrower ? borrower.name : (newLoan.borrower_name || 'Unknown'),
          guarantor_name: guarantor ? guarantor.name : 'Unknown',
          principal,
          interest_rate: 0.06,
          months,
          status: 'Pending',
          created_at: new Date().toISOString(),
          due_at: new Date(new Date().setMonth(new Date().getMonth() + months)).toISOString(),
          totalInterest,
          biMonthlyPayment,
          amountPaid: 0,
          remainingBalance: totalToPay
        };

        setContractLoan(tempLoan);
        
        setIsAddLoanOpen(false);
        setIsBorrowerMember(true);
        setNewLoan({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });
        fetchData();

        // Trigger PDF generation with a slightly longer delay to ensure DOM update
        setTimeout(() => generateContractPDF(tempLoan), 1500);
      } else {
        const err = await res.json();
        alert(err.error);
      }
    } catch (error) {
      console.error("Error adding loan:", error);
    }
  };

  const handlePayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/loan-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loanPayment)
      });
      if (res.ok) {
        setIsPayLoanOpen(false);
        setLoanPayment({ loan_id: '', amount: 0 });
        fetchData();
      }
    } catch (error) {
      console.error("Error paying loan:", error);
    }
  };

  const handleApproveLoan = async (id: number) => {
    console.log("Approving loan:", id);
    try {
      const res = await fetch(`/api/loans/${id}/approve`, { method: 'POST' });
      if (res.ok) {
        const approvedLoan = loans.find(l => l.id === id);
        if (approvedLoan) {
          console.log("Found loan for contract:", approvedLoan.debtor_name);
          setContractLoan(approvedLoan);
          // Increased delay and added explicit check
          setTimeout(() => generateContractPDF(approvedLoan), 1000);
        }
        fetchData();
      }
    } catch (error) {
      console.error("Error approving loan:", error);
      alert("Failed to approve loan. Please check console for details.");
    }
  };

  const generateContractPDF = async (loan: Loan) => {
    console.log("Generating PDF for:", loan.debtor_name);
    const element = document.getElementById(`contract-${loan.id}`);
    if (!element) {
      console.error("Contract element not found in DOM");
      return;
    }

    try {
      const dataUrl = await toPng(element, { 
        backgroundColor: '#ffffff', 
        quality: 1,
        pixelRatio: 2 // Better quality
      });
      
      const pdf = new jsPDF('p', 'mm', 'a4');
      const imgProps = pdf.getImageProperties(dataUrl);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (imgProps.height * pdfWidth) / imgProps.width;
      
      pdf.addImage(dataUrl, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`Loan_Contract_${loan.debtor_name.replace(/\s+/g, '_')}.pdf`);
      console.log("PDF saved successfully");
      setContractLoan(null);
    } catch (error) {
      console.error("Error generating contract PDF:", error);
      alert("Contract PDF generation failed. You can try the manual download button in the loan details.");
    }
  };

  const handleRejectLoan = async (id: number) => {
    try {
      const res = await fetch(`/api/loans/${id}/reject`, { method: 'POST' });
      if (res.ok) fetchData();
    } catch (error) {
      console.error("Error rejecting loan:", error);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
  };

  const handleCopyMemberDetails = async () => {
    const element = document.getElementById('member-dashboard');
    if (!element) return;

    try {
      const blob = await toBlob(element, { 
        backgroundColor: '#0F172A', 
        pixelRatio: 2,
        style: {
          borderRadius: '24px'
        }
      });
      
      if (blob) {
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob })
        ]);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch (error) {
      console.error("Error copying image to clipboard:", error);
      // Fallback to text copy if image copy fails
      const stats = selectedMember?.stats;
      const text = `
Savers Fund - Member Dashboard
------------------------------
Member: ${selectedMember?.name}
Financial Summary:
- Principal: ${formatCurrency(stats?.principal || 0)}
- Dividend Share: ${formatCurrency(stats?.dividendShare || 0)}
- Expected Receivable: ${formatCurrency(stats?.expectedReceivable || 0)}
      `.trim();
      
      navigator.clipboard.writeText(text).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  const filteredMembers = members.filter(m => m.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (isLoading && !summary) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Loading financial data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F172A] text-slate-200 font-sans selection:bg-emerald-500/30">
      {/* Sidebar Navigation */}
      <nav className="fixed left-0 top-0 bottom-0 w-20 md:w-64 bg-[#1E293B]/50 backdrop-blur-xl border-r border-white/5 z-40 flex flex-col">
        <div className="p-6 flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <Coins className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-xl font-bold hidden md:block tracking-tight">Savers Fund</h1>
        </div>

        <div className="flex-1 px-4 py-6 space-y-2">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
            { id: 'members', label: 'Members', icon: Users },
            { id: 'loans', label: 'Loans', icon: HandCoins },
            { id: 'history', label: 'History', icon: History },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id as any)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${
                view === item.id 
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' 
                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
              }`}
            >
              <item.icon className="w-6 h-6 shrink-0" />
              <span className="font-medium hidden md:block">{item.label}</span>
            </button>
          ))}
        </div>

        <div className="p-4 border-t border-white/5">
          <button 
            onClick={() => fetchData()}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all"
          >
            <AlertCircle className="w-6 h-6 shrink-0" />
            <span className="font-medium hidden md:block">Refresh Data</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 md:pl-64 min-h-screen">
        <header className="sticky top-0 bg-[#0F172A]/80 backdrop-blur-md border-b border-white/5 z-30 px-8 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold capitalize">{view}</h2>
          <div className="flex items-center gap-4">
            <div className="relative hidden sm:block">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#1E293B] border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-64 transition-all"
              />
            </div>
            <button 
              onClick={() => setIsAddContributionOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              Record Contribution
            </button>
          </div>
        </header>

        <div className="p-8 max-w-7xl mx-auto space-y-8">
          {view === 'dashboard' && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-8"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Cash on Hand" value={summary?.cashOnHand || 0} icon={Wallet} color="bg-emerald-500" />
                <StatCard title="Total Portfolio" value={summary?.totalPortfolio || 0} icon={HandCoins} color="bg-blue-500" />
                <StatCard title="Dividend Pool" value={summary?.dividendPool || 0} icon={Coins} color="bg-amber-500" />
                <StatCard title="Total Members" value={summary?.totalMembers || 0} icon={Users} color="bg-purple-500" format="number" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <Card className="lg:col-span-2">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">Members Directory</h3>
                    <button 
                      onClick={() => setIsAddMemberOpen(true)}
                      className="text-emerald-500 hover:text-emerald-400 text-sm font-bold flex items-center gap-1"
                    >
                      <Plus className="w-4 h-4" /> Add Member
                    </button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-400 text-sm border-b border-white/5">
                          <th className="pb-4 font-medium">Name</th>
                          <th className="pb-4 font-medium">Slots</th>
                          <th className="pb-4 font-medium">Status</th>
                          <th className="pb-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredMembers.map((member) => (
                          <tr key={member.id} className="group hover:bg-white/5 transition-colors">
                            <td className="py-4 font-medium">{member.name}</td>
                            <td className="py-4">{member.slots}</td>
                            <td className="py-4">
                              <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                                member.status === 'Active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-slate-500/10 text-slate-500'
                              }`}>
                                {member.status}
                              </span>
                            </td>
                            <td className="py-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button 
                                  onClick={() => handleSelectMember(member)}
                                  className="p-2 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg transition-all"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => { setMemberToDelete(member); setIsDeleteConfirmOpen(true); }}
                                  className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>

                <div className="space-y-8">
                  <Card>
                    <h3 className="text-xl font-bold mb-4">Quick Stats</h3>
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Total Slots</span>
                        <span className="font-bold">{summary?.totalSlots}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Guarantor Rewards</span>
                        <span className="font-bold text-blue-400">{formatCurrency(summary?.totalGuarantorRewards || 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-slate-400">Total Penalties</span>
                        <span className="font-bold text-red-400">{formatCurrency(summary?.totalPenalties || 0)}</span>
                      </div>
                    </div>
                  </Card>

                  <Card className="bg-gradient-to-br from-emerald-500/20 to-blue-500/20 border-emerald-500/20">
                    <h3 className="text-xl font-bold mb-2">Loan Eligibility</h3>
                    <p className="text-slate-400 text-sm mb-4">Max eligibility: 2x total contribution principal plus guarantor principal.</p>
                    <button 
                      onClick={() => setIsAddLoanOpen(true)}
                      className="w-full bg-white text-[#0F172A] py-3 rounded-xl font-bold hover:bg-slate-200 transition-all"
                    >
                      Apply for Loan
                    </button>
                  </Card>
                </div>
              </div>

              {selectedMember && (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  id="member-dashboard"
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center text-3xl font-bold text-white shadow-xl shadow-emerald-500/20">
                        {selectedMember.name[0]}
                      </div>
                      <div>
                        <h2 className="text-3xl font-bold">{selectedMember.name}</h2>
                        <p className="text-slate-400">Member ID: #{selectedMember.id} • {selectedMember.slots} Slots</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button 
                        onClick={handleCopyMemberDetails}
                        className={`p-3 border rounded-xl transition-all flex items-center gap-2 ${
                          copied 
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-500' 
                            : 'bg-[#1E293B] border-white/10 hover:bg-white/5 text-slate-400'
                        }`}
                        title="Copy details to clipboard"
                      >
                        {copied ? (
                          <>
                            <Check className="w-5 h-5" />
                            <span className="text-xs font-bold hidden sm:block">Copied!</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-5 h-5" />
                            <span className="text-xs font-bold hidden sm:block">Copy Details</span>
                          </>
                        )}
                      </button>
                      <button 
                        onClick={() => setSelectedMember(null)}
                        className="p-3 bg-[#1E293B] border border-white/10 rounded-xl hover:bg-white/5 transition-all text-slate-400"
                      >
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <Card className="bg-emerald-500/10 border-emerald-500/20">
                      <p className="text-emerald-500 text-sm font-bold uppercase tracking-wider mb-1">Expected Receivable</p>
                      <h3 className="text-4xl font-black text-emerald-500">
                        {formatCurrency(selectedMember.stats?.expectedReceivable || 0)}
                      </h3>
                      <p className="text-slate-400 text-xs mt-4 leading-relaxed">
                        Includes your proportional share of the group's 4% dividend pool and 2% interest from loans you've guaranteed.
                      </p>
                    </Card>

                    <div className="grid grid-cols-2 gap-4 md:col-span-2">
                      <Card className="p-4">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Principal Contribution</p>
                        <p className="text-xl font-bold">{formatCurrency(selectedMember.stats?.principal || 0)}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Dividend Share</p>
                        <p className="text-xl font-bold text-amber-500">{formatCurrency(selectedMember.stats?.dividendShare || 0)}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Guarantor Interest</p>
                        <p className="text-xl font-bold text-blue-500">{formatCurrency(selectedMember.stats?.guarantorInterest || 0)}</p>
                      </Card>
                      <Card className="p-4">
                        <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-1">Outstanding Debt</p>
                        <p className="text-xl font-bold text-red-500">{formatCurrency(selectedMember.stats?.outstandingDebt || 0)}</p>
                      </Card>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Card>
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <History className="w-5 h-5 text-emerald-500" />
                        Recent Contributions
                      </h3>
                      <div className="space-y-4">
                        {contributionHistory.length > 0 ? (
                          contributionHistory.slice(0, 5).map((tx) => (
                            <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                              <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg ${tx.type === 'Contribution' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                  {tx.type === 'Contribution' ? <ArrowUpRight className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                                </div>
                                <div>
                                  <p className="font-medium">{tx.type}</p>
                                  <p className="text-xs text-slate-400">{new Date(tx.date).toLocaleDateString()} • {tx.period}</p>
                                </div>
                              </div>
                              <p className="font-bold">{formatCurrency(tx.amount)}</p>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-center py-8">No contributions recorded yet.</p>
                        )}
                      </div>
                    </Card>

                    <Card>
                      <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                        <HandCoins className="w-5 h-5 text-blue-500" />
                        Active Loans
                      </h3>
                      <div className="space-y-4">
                        {loans.filter(l => (l.member_id === selectedMember.id || l.borrower_name === selectedMember.name) && l.status === 'Active').length > 0 ? (
                          loans.filter(l => (l.member_id === selectedMember.id || l.borrower_name === selectedMember.name) && l.status === 'Active').map((loan) => (
                            <div key={loan.id} className="p-4 rounded-xl bg-white/5 space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-lg">{formatCurrency(loan.principal)}</p>
                                  <p className="text-xs text-slate-400">Due: {new Date(loan.due_at).toLocaleDateString()}</p>
                                </div>
                                <button 
                                  onClick={() => { setLoanPayment({ loan_id: loan.id.toString(), amount: loan.biMonthlyPayment }); setIsPayLoanOpen(true); }}
                                  className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded-lg text-xs font-bold transition-all"
                                >
                                  Pay {formatCurrency(loan.biMonthlyPayment)}
                                </button>
                              </div>
                              <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                                <div 
                                  className="bg-blue-500 h-full transition-all duration-1000" 
                                  style={{ width: `${(loan.amountPaid / (loan.principal + loan.totalInterest)) * 100}%` }}
                                />
                              </div>
                              <div className="flex justify-between text-[10px] uppercase tracking-wider font-bold text-slate-500">
                                <span>Paid: {formatCurrency(loan.amountPaid)}</span>
                                <span>Balance: {formatCurrency(loan.remainingBalance)}</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-slate-500 text-center py-8">No active loans.</p>
                        )}
                      </div>
                    </Card>
                  </div>
                </motion.div>
              )}
            </motion.div>
          )}

          {view === 'members' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredMembers.map(member => (
                <Card key={member.id} className="hover:border-emerald-500/30 transition-all cursor-pointer" onClick={() => { handleSelectMember(member); setView('dashboard'); }}>
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-xl font-bold text-white">
                      {member.name[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{member.name}</h3>
                      <p className="text-slate-400 text-sm">{member.slots} Slots • {member.status}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <span className="text-xs text-slate-500">Joined {new Date(member.joined_at).toLocaleDateString()}</span>
                    <ChevronRight className="w-4 h-4 text-slate-500" />
                  </div>
                </Card>
              ))}
            </motion.div>
          )}

          {view === 'loans' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
              <div className="flex justify-between items-center">
                <h3 className="text-xl font-bold">Loan Management</h3>
                <button onClick={() => setIsAddLoanOpen(true)} className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all">
                  <Plus className="w-4 h-4" /> New Loan Application
                </button>
              </div>

              {/* Pending Loans Section */}
              {loans.filter(l => l.status === 'Pending').length > 0 && (
                <div className="space-y-4">
                  <h4 className="text-sm font-bold text-amber-500 uppercase tracking-wider flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Pending Approvals
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {loans.filter(l => l.status === 'Pending').map(loan => (
                      <Card key={loan.id} className="border-amber-500/20 bg-amber-500/5">
                        <div className="flex justify-between items-start mb-4">
                          <div>
                            <h4 className="font-bold text-lg">{loan.debtor_name}</h4>
                            <p className="text-xs text-slate-400">Guarantor: {loan.guarantor_name}</p>
                          </div>
                          <span className="px-2 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-500/10 text-amber-500">
                            {loan.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mb-6">
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Requested Amount</p>
                            <p className="font-bold">{formatCurrency(loan.principal)}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-500 uppercase font-bold">Term</p>
                            <p className="font-bold">{loan.months} Months</p>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button 
                            onClick={() => handleApproveLoan(loan.id)}
                            className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl font-bold text-sm transition-all"
                          >
                            Approve Loan
                          </button>
                          <button 
                            onClick={() => handleRejectLoan(loan.id)}
                            className="flex-1 bg-white/5 hover:bg-red-500/10 hover:text-red-500 py-2 rounded-xl font-bold text-sm transition-all"
                          >
                            Reject
                          </button>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {/* Active/Paid Loans Section */}
              <div className="space-y-4">
                <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider">Active Portfolio</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {loans.filter(l => l.status !== 'Pending' && l.status !== 'Rejected').map(loan => (
                    <Card key={loan.id} className={`${loan.status === 'Paid' ? 'opacity-60' : ''}`}>
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <h4 className="font-bold text-lg">{loan.debtor_name}</h4>
                          <p className="text-xs text-slate-400">Guarantor: {loan.guarantor_name}</p>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase ${
                          loan.status === 'Active' ? 'bg-blue-500/10 text-blue-500' : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                          {loan.status}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Principal</p>
                          <p className="font-bold">{formatCurrency(loan.principal)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] text-slate-500 uppercase font-bold">Term</p>
                          <p className="font-bold">{loan.months} Months</p>
                        </div>
                      </div>
                      {loan.status === 'Active' && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-slate-400">Repayment Progress</span>
                            <span className="font-bold">{Math.round((loan.amountPaid / (loan.principal + loan.totalInterest)) * 100)}%</span>
                          </div>
                          <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                            <div 
                              className="bg-blue-500 h-full transition-all" 
                              style={{ width: `${(loan.amountPaid / (loan.principal + loan.totalInterest)) * 100}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center pt-2">
                            <div className="flex gap-3">
                              <p className="text-xs font-medium text-slate-400">Next: {formatCurrency(loan.biMonthlyPayment)}</p>
                              <button 
                                onClick={() => { setContractLoan(loan); setTimeout(() => generateContractPDF(loan), 500); }}
                                className="text-slate-500 hover:text-slate-300 text-[10px] font-bold flex items-center gap-1"
                              >
                                <Download className="w-3 h-3" /> Contract
                              </button>
                            </div>
                            <button 
                              onClick={() => { setLoanPayment({ loan_id: loan.id.toString(), amount: loan.biMonthlyPayment }); setIsPayLoanOpen(true); }}
                              className="text-blue-500 hover:text-blue-400 text-xs font-bold"
                            >
                              Record Payment
                            </button>
                          </div>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {view === 'history' && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <Card>
                <h3 className="text-xl font-bold mb-6">Global Transaction History</h3>
                <div className="space-y-2">
                  {allContributions.map(tx => {
                    const member = members.find(m => m.id === tx.member_id);
                    return (
                      <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${tx.type === 'Contribution' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {tx.type === 'Contribution' ? <ArrowUpRight className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold">{member?.name || 'Unknown Member'}</p>
                            <p className="text-xs text-slate-400">{new Date(tx.date).toLocaleString()} • {tx.type} • {tx.period}</p>
                          </div>
                        </div>
                        <p className={`font-black text-lg ${tx.type === 'Contribution' ? 'text-emerald-500' : 'text-blue-400'}`}>
                          {formatCurrency(tx.amount)}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}
        </div>
      </main>

      {/* Modals */}
      <Modal isOpen={isAddMemberOpen} onClose={() => setIsAddMemberOpen(false)} title="Add New Member">
        <form onSubmit={handleAddMember} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Full Name</label>
            <input 
              type="text" 
              required
              value={newMember.name}
              onChange={e => setNewMember({...newMember, name: e.target.value})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              placeholder="Enter member name"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Number of Slots</label>
            <input 
              type="number" 
              min="1"
              required
              value={newMember.slots}
              onChange={e => setNewMember({...newMember, slots: parseInt(e.target.value)})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20">
            Create Member Account
          </button>
        </form>
      </Modal>

      <Modal isOpen={isAddContributionOpen} onClose={() => setIsAddContributionOpen(false)} title="Record Contribution">
        <form onSubmit={handleAddContribution} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Member</label>
            <select 
              required
              value={newContribution.member_id}
              onChange={e => setNewContribution({...newContribution, member_id: e.target.value})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            >
              <option value="">Select a member</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Period</label>
              <select 
                value={newContribution.period}
                onChange={e => setNewContribution({...newContribution, period: e.target.value as any})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option value="15th">15th</option>
                <option value="30th">30th</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Amount</label>
              <input 
                type="number" 
                required
                value={newContribution.amount}
                onChange={e => setNewContribution({...newContribution, amount: parseFloat(e.target.value)})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <input 
              type="checkbox" 
              id="isFirst"
              checked={newContribution.isFirstOfYear}
              onChange={e => setNewContribution({...newContribution, isFirstOfYear: e.target.checked})}
              className="w-5 h-5 rounded border-white/10 bg-[#1E293B] text-emerald-500 focus:ring-emerald-500/50"
            />
            <label htmlFor="isFirst" className="text-sm font-medium">Include Annual Fee (₱200/slot)</label>
          </div>
          <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold transition-all">
            Post Transaction
          </button>
        </form>
      </Modal>

      <Modal isOpen={isAddLoanOpen} onClose={() => { setIsAddLoanOpen(false); setIsBorrowerMember(true); }} title="New Loan Application">
        <form onSubmit={handleAddLoan} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Guarantor (Required)</label>
            <select 
              required
              value={newLoan.guarantor_id}
              onChange={e => setNewLoan({...newLoan, guarantor_id: e.target.value})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">Select guarantor</option>
              {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <input 
              type="checkbox" 
              id="isMember"
              checked={isBorrowerMember}
              onChange={e => {
                setIsBorrowerMember(e.target.checked);
                setNewLoan({...newLoan, member_id: '', borrower_name: ''});
              }}
              className="w-5 h-5 rounded border-white/10 bg-[#1E293B] text-blue-500 focus:ring-blue-500/50"
            />
            <label htmlFor="isMember" className="text-sm font-medium">Borrower is a Member</label>
          </div>

          {isBorrowerMember ? (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Borrower (Member)</label>
              <select 
                required
                value={newLoan.member_id}
                onChange={e => setNewLoan({...newLoan, member_id: e.target.value, borrower_name: ''})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                <option value="">Select member</option>
                {members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Non-Member Name</label>
              <input 
                type="text" 
                required
                value={newLoan.borrower_name || ''}
                onChange={e => setNewLoan({...newLoan, borrower_name: e.target.value, member_id: ''})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                placeholder="Enter borrower name"
              />
            </div>
          )}
          
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Amount</label>
              <input 
                type="number" 
                required
                value={newLoan.amount}
                onChange={e => setNewLoan({...newLoan, amount: parseFloat(e.target.value)})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Term (Months)</label>
              <select 
                value={newLoan.months}
                onChange={e => setNewLoan({...newLoan, months: parseInt(e.target.value)})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              >
                {[1,2,3,4,5].map(m => <option key={m} value={m}>{m} Month{m > 1 ? 's' : ''}</option>)}
              </select>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Interest Rate</span>
              <span className="font-bold">6% per month</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Bi-monthly Payment</span>
              <span className="font-bold text-blue-400">
                {formatCurrency((newLoan.amount + (newLoan.amount * 0.06 * newLoan.months)) / (newLoan.months * 2))}
              </span>
            </div>
          </div>
          <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20">
            Submit Loan Request
          </button>
        </form>
      </Modal>

      <Modal isOpen={isPayLoanOpen} onClose={() => setIsPayLoanOpen(false)} title="Record Loan Payment">
        <form onSubmit={handlePayLoan} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Loan</label>
            <select 
              required
              value={loanPayment.loan_id}
              onChange={e => setLoanPayment({...loanPayment, loan_id: e.target.value})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            >
              <option value="">Select loan</option>
              {loans.filter(l => l.status === 'Active').map(l => (
                <option key={l.id} value={l.id}>{l.debtor_name} - {formatCurrency(l.principal)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Payment Amount</label>
            <input 
              type="number" 
              required
              value={loanPayment.amount}
              onChange={e => setLoanPayment({...loanPayment, amount: parseFloat(e.target.value)})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
            />
          </div>
          <button type="submit" className="w-full bg-blue-500 hover:bg-blue-600 text-white py-4 rounded-xl font-bold transition-all">
            Confirm Payment
          </button>
        </form>
      </Modal>

      <Modal isOpen={isDeleteConfirmOpen} onClose={() => setIsDeleteConfirmOpen(false)} title="Confirm Deletion">
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20">
            <AlertCircle className="w-8 h-8 text-red-500 shrink-0" />
            <p className="text-sm text-red-200">
              Warning: Irreversible Action. Are you sure you want to delete <strong>{memberToDelete?.name}</strong>? This will permanently remove all their contributions, loans, and transaction history.
            </p>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setIsDeleteConfirmOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 py-3 rounded-xl font-bold transition-all">
              Cancel
            </button>
            <button onClick={handleDeleteMember} className="flex-1 bg-red-500 hover:bg-red-600 text-white py-3 rounded-xl font-bold transition-all">
              Delete Permanently
            </button>
          </div>
        </div>
      </Modal>

      {/* Hidden Contract Template for PDF Generation */}
      {contractLoan && (
        <div style={{ position: 'fixed', left: 0, top: 0, width: '1px', height: '1px', overflow: 'hidden', zIndex: -100, opacity: 0.01 }}>
          <div 
            id={`contract-${contractLoan.id}`} 
            className="bg-white text-black p-12 font-serif"
            style={{ width: '800px', minHeight: '1120px' }}
          >
            <div className="flex items-center justify-between border-b-2 border-black pb-6 mb-8">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-emerald-600 rounded-xl flex items-center justify-center">
                  <Coins className="w-10 h-10 text-white" />
                </div>
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tighter">Savers Fund</h1>
                  <p className="text-sm font-bold text-slate-600">Official Loan Agreement</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-slate-500">Contract No.</p>
                <p className="text-lg font-bold">SF-LOAN-{contractLoan.id}-{new Date().getFullYear()}</p>
              </div>
            </div>

            <div className="space-y-8">
              <section>
                <h2 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 uppercase tracking-widest">1. The Parties</h2>
                <p className="leading-relaxed">
                  This Loan Agreement is entered into on this <strong>{new Date().toLocaleDateString()}</strong>, by and between:
                </p>
                <div className="mt-4 space-y-2">
                  <p><strong>Lender:</strong> Savers Fund Manager, representing the Savers Fund Collective.</p>
                  <p><strong>Borrower:</strong> {contractLoan.debtor_name}</p>
                  <p><strong>Guarantor:</strong> {contractLoan.guarantor_name}</p>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 uppercase tracking-widest">2. Loan Terms</h2>
                <div className="grid grid-cols-2 gap-y-4">
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Principal Amount</p>
                    <p className="text-xl font-bold">{formatCurrency(contractLoan.principal)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Interest Rate</p>
                    <p className="text-xl font-bold">6% Monthly</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Total Interest</p>
                    <p className="text-xl font-bold">{formatCurrency(contractLoan.totalInterest)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Total Repayment</p>
                    <p className="text-xl font-bold">{formatCurrency(contractLoan.principal + contractLoan.totalInterest)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Loan Term</p>
                    <p className="text-xl font-bold">{contractLoan.months} Month(s)</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-500 uppercase font-bold">Due Date</p>
                    <p className="text-xl font-bold">{new Date(contractLoan.due_at).toLocaleDateString()}</p>
                  </div>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-bold border-b border-slate-200 pb-2 mb-4 uppercase tracking-widest">3. Repayment Schedule</h2>
                <p className="leading-relaxed mb-4">
                  The Borrower agrees to repay the total amount of <strong>{formatCurrency(contractLoan.principal + contractLoan.totalInterest)}</strong> in 
                  bi-monthly installments of <strong>{formatCurrency(contractLoan.biMonthlyPayment)}</strong>.
                </p>
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="bg-slate-50">
                      <th className="border border-slate-200 p-2 text-left">Description</th>
                      <th className="border border-slate-200 p-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <td className="border border-slate-200 p-2">Principal Portion</td>
                      <td className="border border-slate-200 p-2 text-right">{formatCurrency(contractLoan.principal)}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 p-2">Interest Portion (4% Dividend Pool)</td>
                      <td className="border border-slate-200 p-2 text-right">{formatCurrency(contractLoan.totalInterest * (4/6))}</td>
                    </tr>
                    <tr>
                      <td className="border border-slate-200 p-2">Interest Portion (2% Guarantor Reward)</td>
                      <td className="border border-slate-200 p-2 text-right">{formatCurrency(contractLoan.totalInterest * (2/6))}</td>
                    </tr>
                  </tbody>
                </table>
              </section>

              <section className="pt-12">
                <div className="grid grid-cols-2 gap-12">
                  <div className="space-y-8">
                    <div className="border-t border-black pt-2">
                      <p className="font-bold uppercase text-xs">Borrower Signature</p>
                      <p className="text-sm mt-1">{contractLoan.debtor_name}</p>
                    </div>
                    <div className="border-t border-black pt-2">
                      <p className="font-bold uppercase text-xs">Guarantor Signature</p>
                      <p className="text-sm mt-1">{contractLoan.guarantor_name}</p>
                    </div>
                  </div>
                  <div className="space-y-8">
                    <div className="border-t border-black pt-2">
                      <p className="font-bold uppercase text-xs">Lender Signature</p>
                      <p className="text-sm mt-1">Savers Fund Manager</p>
                    </div>
                    <div className="pt-2">
                      <p className="font-bold uppercase text-xs text-slate-400">Date Signed</p>
                      <p className="text-sm mt-1">____________________</p>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            <div className="mt-20 text-center text-[10px] text-slate-400 uppercase tracking-widest">
              This is a legally binding document generated by the Savers Fund Management System.
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
