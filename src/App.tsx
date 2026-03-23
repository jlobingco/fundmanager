import React, { useState, useEffect, useMemo } from 'react';
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
  Coins,
  LogIn,
  LogOut
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng, toBlob } from 'html-to-image';
import jsPDF from 'jspdf';
import { 
  auth, 
  db, 
  loginWithGoogle, 
  logout, 
  handleFirestoreError, 
  OperationType 
} from './firebase';
import { 
  onAuthStateChanged, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  Timestamp,
  runTransaction,
  limit
} from 'firebase/firestore';

// --- Types ---

interface Member {
  id: string;
  name: string;
  slots: number;
  status: string;
  joined_at: Timestamp;
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
  id: string;
  member_id: string;
  amount: number;
  type: 'AnnualFee' | 'Penalty' | 'Refund';
  date: Timestamp;
}

interface Contribution {
  id: string;
  member_id: string;
  amount: number;
  period: '15th' | '30th';
  month: string;
  year: number;
  date: Timestamp;
}

const MONTHS = [
  { value: '01', label: 'January' },
  { value: '02', label: 'February' },
  { value: '03', label: 'March' },
  { value: '04', label: 'April' },
  { value: '05', label: 'May' },
  { value: '06', label: 'June' },
  { value: '07', label: 'July' },
  { value: '08', label: 'August' },
  { value: '09', label: 'September' },
  { value: '10', label: 'October' },
  { value: '11', label: 'November' },
  { value: '12', label: 'December' },
];

interface Loan {
  id: string;
  member_id: string | null;
  guarantor_id: string;
  borrower_name: string | null;
  debtor_name: string;
  guarantor_name: string;
  principal: number;
  interest_rate: number;
  months: number;
  status: 'Pending' | 'Active' | 'Paid' | 'Rejected';
  created_at: Timestamp;
  due_at: Timestamp;
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
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [view, setView] = useState<'dashboard' | 'members' | 'loans' | 'history'>('dashboard');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [rawLoans, setRawLoans] = useState<Loan[]>([]);
  const [paymentsMap, setPaymentsMap] = useState<Record<string, number>>({});
  
  const loans = useMemo(() => {
    return rawLoans.map(loan => {
      const amountPaid = paymentsMap[loan.id] || 0;
      const totalToPay = loan.principal + loan.totalInterest;
      const remainingBalance = Math.max(0, totalToPay - amountPaid);

      let debtor_name = loan.borrower_name || 'Unknown';
      if (loan.member_id) {
        const m = members.find(m => m.id === loan.member_id);
        if (m) debtor_name = m.name;
      }
      
      let guarantor_name = 'Unknown';
      const g = members.find(m => m.id === loan.guarantor_id);
      if (g) guarantor_name = g.name;

      return { ...loan, debtor_name, guarantor_name, amountPaid, remainingBalance };
    });
  }, [rawLoans, members, paymentsMap]);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [contributionHistory, setContributionHistory] = useState<(Transaction | Contribution)[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [allContributions, setAllContributions] = useState<(Transaction | Contribution)[]>([]);

  useEffect(() => {
    const combined = [
      ...transactions.filter(t => t.type === 'AnnualFee'),
      ...contributions
    ].sort((a, b) => {
      const dateA = a.date && typeof a.date.toMillis === 'function' ? a.date.toMillis() : 0;
      const dateB = b.date && typeof b.date.toMillis === 'function' ? b.date.toMillis() : 0;
      return dateB - dateA;
    });
    setAllContributions(combined);
  }, [transactions, contributions]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
  const [isAddContributionOpen, setIsAddContributionOpen] = useState(false);
  const [isAddLoanOpen, setIsAddLoanOpen] = useState(false);
  const [isBorrowerMember, setIsBorrowerMember] = useState(true);
  const [isPayLoanOpen, setIsPayLoanOpen] = useState(false);
  const [isEditMemberOpen, setIsEditMemberOpen] = useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isRefreshConfirmOpen, setIsRefreshConfirmOpen] = useState(false);
  const [contractLoan, setContractLoan] = useState<Loan | null>(null);
  const [memberToDelete, setMemberToDelete] = useState<Member | null>(null);
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [copied, setCopied] = useState(false);
  const [notification, setNotification] = useState<{ message: string, type: 'success' | 'info' | 'error' } | null>(null);

  const showNotification = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 5000);
  };

  // Form States
  const [newMember, setNewMember] = useState({ name: '', slots: 1 });
  const [newContribution, setNewContribution] = useState({ 
    member_id: '', 
    amount: 0, 
    isFirstOfYear: false, 
    period: '15th' as '15th' | '30th',
    month: (new Date().getMonth() + 1).toString().padStart(2, '0'),
    year: new Date().getFullYear()
  });

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  const paidAnnualFeeMembers = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const set = new Set<string>();
    allContributions.forEach(tx => {
      if ('type' in tx && tx.type === 'AnnualFee') {
        const year = (tx.date && typeof tx.date.toDate === 'function' ? tx.date.toDate().getFullYear() : 0);
        if (year === currentYear) {
          set.add(tx.member_id);
        }
      }
    });
    return set;
  }, [allContributions]);

  const paidPeriods = useMemo(() => {
    const map: Record<string, Set<'15th' | '30th'>> = {};
    allContributions.forEach(tx => {
      if (!('type' in tx)) { // It's a Contribution
        const key = `${tx.member_id}-${tx.month}-${tx.year}`;
        if (!map[key]) map[key] = new Set();
        map[key].add(tx.period);
      }
    });
    return map;
  }, [allContributions]);

  const memberLatestContribution = useMemo(() => {
    const map: Record<string, string> = {};
    allContributions.forEach(tx => {
      if (!('type' in tx)) { // It's a Contribution
        const monthLabel = MONTHS.find(m => m.value === tx.month)?.label || tx.month;
        const display = `${monthLabel} ${tx.year}`;
        if (!map[tx.member_id]) {
          map[tx.member_id] = display;
        }
      }
    });
    return map;
  }, [allContributions]);

  // Auto-compute contribution amount
  useEffect(() => {
    if (newContribution.member_id) {
      const member = members.find(m => m.id === newContribution.member_id);
      if (member) {
        const contributionPerSlot = 500; // Standard contribution per slot
        setNewContribution(prev => ({ ...prev, amount: member.slots * contributionPerSlot }));
      }
      
      // Auto-switch period if current is paid
      const paid = paidPeriods[`${newContribution.member_id}-${newContribution.month}-${newContribution.year}`];
      if (paid) {
        if (paid.has('15th') && !paid.has('30th') && newContribution.period === '15th') {
          setNewContribution(prev => ({ ...prev, period: '30th' }));
        } else if (paid.has('30th') && !paid.has('15th') && newContribution.period === '30th') {
          setNewContribution(prev => ({ ...prev, period: '15th' }));
        }
      }

      if (paidAnnualFeeMembers.has(newContribution.member_id)) {
        setNewContribution(prev => ({ ...prev, isFirstOfYear: false }));
      }
    }
  }, [newContribution.member_id, newContribution.month, newContribution.year, members, paidAnnualFeeMembers, paidPeriods]);

  const [newLoan, setNewLoan] = useState({ 
    member_id: '', 
    borrower_name: '', 
    guarantor_id: '', 
    amount: 0, 
    months: 1 
  });
  const [loanPayment, setLoanPayment] = useState({ loan_id: '', amount: 0 });
  const [authError, setAuthError] = useState<string | null>(null);

  const handleLogin = async () => {
    try {
      setAuthError(null);
      await loginWithGoogle();
    } catch (error: any) {
      if (error.code === 'auth/popup-blocked') {
        setAuthError('Sign-in popup was blocked by your browser. Please allow popups for this site.');
      } else if (error.code === 'auth/cancelled-popup-request') {
        setAuthError('Sign-in was cancelled. Please try again.');
      } else {
        setAuthError('An error occurred during sign-in. Please try again.');
      }
    }
  };

  useEffect(() => {
    let cleanup: (() => void) | undefined;
    if (isAuthReady && user) {
      cleanup = fetchData();
    }
    return () => {
      if (cleanup) cleanup();
    };
  }, [isAuthReady, user]);

  const fetchData = () => {
    setIsLoading(true);
    
    // Real-time listeners
    const unsubMembers = onSnapshot(collection(db, 'members'), (snapshot) => {
      const membersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Member));
      setMembers(membersData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'members'));

    const unsubLoans = onSnapshot(collection(db, 'loans'), (snapshot) => {
      const loansData = snapshot.docs.map((loanDoc) => {
        const data = loanDoc.data();
        const principal = Number(data.principal) || 0;
        const interestRate = Number(data.interest_rate) || 0.06;
        const months = Number(data.months) || 1;
        
        const totalInterest = principal * interestRate * months;
        const totalToPay = principal + totalInterest;
        const numPayments = months * 2;
        const biMonthlyPayment = totalToPay / numPayments;

        return { 
          id: loanDoc.id, 
          ...data, 
          principal,
          interest_rate: interestRate,
          months,
          totalInterest, 
          biMonthlyPayment,
        } as Loan;
      });
      setRawLoans(loansData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'loans'));

    const unsubPayments = onSnapshot(collection(db, 'loan_payments'), (snapshot) => {
      const map: Record<string, number> = {};
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const loanId = data.loan_id;
        const amount = Number(data.amount_paid) || 0;
        map[loanId] = (map[loanId] || 0) + amount;
      });
      setPaymentsMap(map);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'loan_payments'));

    const unsubTx = onSnapshot(query(collection(db, 'transactions'), orderBy('date', 'desc')), (snapshot) => {
      const txData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
      setTransactions(txData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    const unsubContributions = onSnapshot(query(collection(db, 'contributions'), orderBy('date', 'desc')), (snapshot) => {
      const cData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Contribution));
      setContributions(cData);
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'contributions'));

    setIsLoading(false);
    return () => {
      unsubMembers();
      unsubLoans();
      unsubPayments();
      unsubTx();
      unsubContributions();
    };
  };

  // Recalculate summary whenever data changes
  useEffect(() => {
    if (members.length > 0 || loans.length > 0 || allContributions.length > 0) {
      const totalContributions = allContributions.filter(t => !('type' in t)).reduce((sum, t) => sum + t.amount, 0);
      const totalAnnualFees = allContributions.filter(t => 'type' in t && t.type === 'AnnualFee').reduce((sum, t) => sum + t.amount, 0);
      const totalPenalties = allContributions.filter(t => 'type' in t && t.type === 'Penalty').reduce((sum, t) => sum + t.amount, 0);
      const totalRefunds = allContributions.filter(t => 'type' in t && t.type === 'Refund').reduce((sum, t) => sum + t.amount, 0);
      
      const activeLoans = loans.filter(l => l.status === 'Active').reduce((sum, l) => sum + l.principal, 0);
      
      const totalMembers = members.filter(m => m.status === 'Active').length;
      const totalSlots = members.filter(m => m.status === 'Active').reduce((sum, m) => sum + m.slots, 0);

      const totalDividendPool = loans
        .filter(l => l.status === 'Active' || l.status === 'Paid')
        .reduce((sum, l) => sum + (l.principal * 0.04 * l.months), 0);
      
      const totalGuarantorRewards = loans
        .filter(l => l.status === 'Active' || l.status === 'Paid')
        .reduce((sum, l) => sum + (l.principal * 0.02 * l.months), 0);

      setSummary({
        cashOnHand: (totalContributions + totalAnnualFees + totalPenalties) - (activeLoans + totalRefunds),
        totalPortfolio: activeLoans,
        dividendPool: totalDividendPool,
        totalGuarantorRewards,
        totalPenalties,
        totalMembers,
        totalSlots
      });
    }
  }, [members, loans, allContributions]);

  const handleSelectMember = async (member: Member) => {
    setIsLoading(true);
    try {
      const memberId = member.id;
      
      // Calculate member stats
      const txSnap = await getDocs(query(collection(db, 'transactions'), where('member_id', '==', memberId)));
      const cSnap = await getDocs(query(collection(db, 'contributions'), where('member_id', '==', memberId)));
      
      const txs = txSnap.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
      const cs = cSnap.docs.map(d => ({ id: d.id, ...d.data() } as Contribution));
      
      const principal = cs.reduce((sum, t) => sum + t.amount, 0);
      const annualFees = txs.filter(t => t.type === 'AnnualFee').reduce((sum, t) => sum + t.amount, 0);
      
      const currentYear = new Date().getFullYear();
      const annualFeePaidThisYear = txs.some(t => t.type === 'AnnualFee' && (t.date as Timestamp).toDate().getFullYear() === currentYear);
      
      const monthsContributed = new Set(cs.map(t => t.month)).size;

      // Global stats for dividend calculation
      const totalPrincipal = allContributions
        .filter(t => !('type' in t))
        .reduce((sum, t) => sum + t.amount, 0);
      
      const totalDividendPool = loans
        .filter(l => l.status === 'Active' || l.status === 'Paid')
        .reduce((sum, l) => sum + (l.principal * 0.04 * l.months), 0);

      // Member specific rewards
      const dividendShare = totalPrincipal > 0 ? (principal / totalPrincipal) * totalDividendPool : 0;
      
      const guarantorInterest = loans
        .filter(l => l.guarantor_id === memberId && (l.status === 'Active' || l.status === 'Paid'))
        .reduce((sum, l) => sum + (l.principal * 0.02 * l.months), 0);

      // Member loans
      const mLoans = loans.filter(l => l.status === 'Active' && (l.member_id === memberId || l.borrower_name === member.name || l.guarantor_id === memberId));
      const outstandingDebt = mLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
      const currentPrincipalDebt = mLoans.reduce((sum, l) => {
        const principalPaid = (l.amountPaid / (1 + (l.interest_rate * l.months))) || 0;
        return sum + Math.max(0, l.principal - principalPaid);
      }, 0);

      const totalLoanAmount = loans.filter(l => l.member_id === memberId || l.borrower_name === member.name || l.guarantor_id === memberId).reduce((sum, l) => sum + l.principal, 0);
      const totalGuaranteedAmount = loans.filter(l => l.guarantor_id === memberId && l.status === 'Active' && l.member_id !== memberId && l.borrower_name !== member.name).reduce((sum, l) => sum + l.principal, 0);

      setSelectedMember({
        ...member,
        stats: {
          principal,
          dividendShare, 
          guarantorInterest, 
          outstandingDebt,
          currentPrincipalDebt,
          totalLoanAmount,
          totalGuaranteedAmount,
          annualFees,
          annualFeePaidThisYear,
          monthsContributed,
          expectedReceivable: principal + dividendShare + guarantorInterest - outstandingDebt
        }
      });
      
      const history = [...txs, ...cs].sort((a, b) => {
        const dateA = a.date && typeof a.date.toMillis === 'function' ? a.date.toMillis() : 0;
        const dateB = b.date && typeof b.date.toMillis === 'function' ? b.date.toMillis() : 0;
        return dateB - dateA;
      });
      setContributionHistory(history);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `members/${member.id}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const q = query(collection(db, 'members'), where('name', '==', newMember.name));
      const snap = await getDocs(q);
      if (!snap.empty) {
        showNotification("A member with this name already exists.", "error");
        return;
      }

      await addDoc(collection(db, 'members'), {
        ...newMember,
        status: 'Active',
        joined_at: new Date()
      });
      
      setIsAddMemberOpen(false);
      setNewMember({ name: '', slots: 1 });
      showNotification('Member added successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'members');
    }
  };

  const handleEditMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMember) return;
    try {
      await updateDoc(doc(db, 'members', editingMember.id), {
        name: editingMember.name,
        slots: editingMember.slots,
        status: editingMember.status
      });
      
      setIsEditMemberOpen(false);
      setEditingMember(null);
      showNotification('Member updated successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `members/${editingMember.id}`);
    }
  };

  const handleDeleteMember = async () => {
    if (!memberToDelete) return;
    try {
      await deleteDoc(doc(db, 'members', memberToDelete.id));
      setIsDeleteConfirmOpen(false);
      setMemberToDelete(null);
      if (selectedMember?.id === memberToDelete.id) setSelectedMember(null);
      showNotification('Member deleted successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `members/${memberToDelete.id}`);
    }
  };

  const handleRefreshData = async () => {
    if (user?.email !== 'juvelynlobingco@gmail.com') {
      showNotification("Only administrators can purge data.", "error");
      return;
    }
    
    setIsLoading(true);
    setIsRefreshConfirmOpen(false);
    
    try {
      const collections = ['members', 'transactions', 'contributions', 'loans', 'loan_payments'];
      
      for (const collName of collections) {
        const q = query(collection(db, collName));
        const snapshot = await getDocs(q);
        const deletePromises = snapshot.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePromises);
      }
      
      showNotification("Database has been successfully purged.", "success");
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, "all collections");
      showNotification("Failed to purge database.", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddContribution = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const member = members.find(m => m.id === newContribution.member_id);
      if (!member) return;

      if (newContribution.isFirstOfYear) {
        const annualFeeTotal = 200 * member.slots;
        await addDoc(collection(db, 'transactions'), {
          member_id: newContribution.member_id,
          amount: annualFeeTotal,
          type: 'AnnualFee',
          date: new Date()
        });
        await addDoc(collection(db, 'contributions'), {
          member_id: newContribution.member_id,
          amount: newContribution.amount - annualFeeTotal,
          period: newContribution.period,
          month: newContribution.month,
          year: newContribution.year,
          date: new Date()
        });
      } else {
        await addDoc(collection(db, 'contributions'), {
          member_id: newContribution.member_id,
          amount: newContribution.amount,
          period: newContribution.period,
          month: newContribution.month,
          year: newContribution.year,
          date: new Date()
        });
      }

      setIsAddContributionOpen(false);
      setNewContribution({ ...newContribution, amount: 0 });
      if (selectedMember && newContribution.member_id === selectedMember.id) {
        handleSelectMember(selectedMember);
      }
      showNotification('Contribution recorded successfully.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'contributions');
    }
  };

  const handleAddLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const borrowerId = newLoan.member_id || null;
      const guarantorId = newLoan.guarantor_id;
      const loanAmount = Number(newLoan.amount);
      const loanMonths = Number(newLoan.months) || 1;
      const nonMemberName = newLoan.borrower_name;

      if ((!borrowerId && !nonMemberName) || !guarantorId || !loanAmount) {
        showNotification("Borrower, Guarantor, and Amount are required.", "error");
        return;
      }

      // Eligibility check
      let borrowerPrincipal = 0;
      let currentDebt = 0;
      if (borrowerId) {
        const cSnap = await getDocs(query(collection(db, 'contributions'), where('member_id', '==', borrowerId)));
        borrowerPrincipal = cSnap.docs.reduce((sum, d) => sum + d.data().amount, 0);
        
        const activeLoans = loans.filter(l => l.member_id === borrowerId && l.status === 'Active');
        currentDebt = activeLoans.reduce((sum, l) => sum + l.remainingBalance, 0);
      }

      const guarantor = members.find(m => m.id === guarantorId);
      if (!guarantor) {
        showNotification("Guarantor not found.", "error");
        return;
      }
      
      const gCSnap = await getDocs(query(collection(db, 'contributions'), where('member_id', '==', guarantorId)));
      const guarantorPrincipal = gCSnap.docs.reduce((sum, d) => sum + d.data().amount, 0);
      
      const totalEligibility = (borrowerPrincipal * 2) + guarantorPrincipal;

      if ((loanAmount + currentDebt) > totalEligibility) {
        showNotification(`Loan exceeds eligibility cap. Total limit: ₱${totalEligibility.toLocaleString()}. Current active debt: ₱${currentDebt.toLocaleString()}.`, "error");
        return;
      }

      const loanData = {
        member_id: borrowerId,
        borrower_name: nonMemberName || null,
        guarantor_id: guarantorId,
        principal: loanAmount,
        interest_rate: 0.06,
        months: loanMonths,
        status: 'Pending',
        created_at: Timestamp.now(),
        due_at: Timestamp.fromDate(new Date(new Date().setMonth(new Date().getMonth() + loanMonths)))
      };

      const docRef = await addDoc(collection(db, 'loans'), loanData);
      
      setIsAddLoanOpen(false);
      setIsBorrowerMember(true);
      setNewLoan({ member_id: '', borrower_name: '', guarantor_id: '', amount: 0, months: 1 });

      setView('loans');
      showNotification('Loan request submitted successfully. Awaiting approval.');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'loans');
    }
  };

  const handlePayLoan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loanPayment.loan_id || loanPayment.amount <= 0) {
      alert("Please select a loan and enter a valid amount.");
      return;
    }

    try {
      const loan = loans.find(l => l.id === loanPayment.loan_id);
      if (!loan) throw new Error("Loan not found");

      const paymentAmount = Number(loanPayment.amount);
      const interestRate = loan.interest_rate || 0.06;
      const totalInterestRate = interestRate * loan.months;
      const interestPortion = paymentAmount * (totalInterestRate / (1 + totalInterestRate));
      const principalPortion = paymentAmount - interestPortion;

      await runTransaction(db, async (transaction) => {
        const loanRef = doc(db, 'loans', loan.id);
        const loanSnap = await transaction.get(loanRef);
        if (!loanSnap.exists()) throw new Error("Loan document does not exist");
        
        const loanData = loanSnap.data();
        const totalToPay = (loanData.principal || 0) + ((loanData.principal || 0) * (loanData.interest_rate || 0.06) * (loanData.months || 1));
        
        const paymentRef = doc(collection(db, 'loan_payments'));
        transaction.set(paymentRef, {
          loan_id: loanPayment.loan_id,
          amount_paid: paymentAmount,
          interest_portion: interestPortion,
          principal_portion: principalPortion,
          date: Timestamp.now()
        });

        // Check if fully paid after this payment
        // We use loan.amountPaid from state as a base, which is slightly risky but better than before
        // Ideally we'd sum payments in the transaction but that's not feasible without a counter on the loan doc
        if (loan.amountPaid + paymentAmount >= totalToPay - 0.01) { // 0.01 for floating point safety
          transaction.update(loanRef, { status: 'Paid' });
        }
      });

      setIsPayLoanOpen(false);
      setLoanPayment({ loan_id: '', amount: 0 });
    } catch (error) {
      console.error("Payment failed:", error);
      handleFirestoreError(error, OperationType.CREATE, 'loan_payments');
    }
  };

  const handleApproveLoan = async (id: string) => {
    try {
      await updateDoc(doc(db, 'loans', id), { status: 'Active' });
      const approvedLoan = loans.find(l => l.id === id);
      if (approvedLoan) {
        setContractLoan(approvedLoan);
        setTimeout(() => generateContractPDF(approvedLoan), 1000);
        showNotification('Loan approved. Generating contract...');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `loans/${id}`);
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
      showNotification("Contract PDF generation failed. You can try the manual download button in the loan details.", "error");
    }
  };

  const handleRejectLoan = async (id: string) => {
    try {
      await updateDoc(doc(db, 'loans', id), { status: 'Rejected' });
      showNotification('Loan request rejected.', 'info');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `loans/${id}`);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' }).format(amount);
  };

  const formatDate = (ts: any) => {
    if (!ts) return 'N/A';
    if (typeof ts.toDate === 'function') return ts.toDate().toLocaleDateString();
    return new Date(ts).toLocaleDateString();
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

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 font-medium">Initializing application...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#1E293B] border border-white/10 rounded-3xl p-8 w-full max-w-md shadow-2xl text-center"
        >
          <div className="w-20 h-20 bg-emerald-500 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/20 mx-auto mb-6">
            <Coins className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold mb-2">Savers Fund</h1>
          <p className="text-slate-400 mb-8">Management System</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-white text-[#0F172A] hover:bg-slate-100 px-6 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all shadow-xl"
          >
            <LogIn className="w-5 h-5" />
            Sign in with Google
          </button>
          
          {authError && (
            <p className="text-red-400 text-sm mt-4 bg-red-500/10 p-3 rounded-xl border border-red-500/20">
              {authError}
            </p>
          )}
          
          <p className="text-xs text-slate-500 mt-8">
            Securely managed by Firebase Authentication
          </p>
        </motion.div>
      </div>
    );
  }

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
      {/* Notifications */}
      <AnimatePresence>
        {notification && (
          <motion.div 
            initial={{ opacity: 0, y: 50, x: '-50%' }}
            animate={{ opacity: 1, y: 0, x: '-50%' }}
            exit={{ opacity: 0, y: 50, x: '-50%' }}
            className={`fixed bottom-8 left-1/2 z-[100] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border ${
              notification.type === 'success' ? 'bg-emerald-500 border-emerald-400 text-white' :
              notification.type === 'error' ? 'bg-red-500 border-red-400 text-white' :
              'bg-blue-500 border-blue-400 text-white'
            }`}
          >
            {notification.type === 'success' && <Check className="w-5 h-5" />}
            {notification.type === 'error' && <AlertCircle className="w-5 h-5" />}
            {notification.type === 'info' && <AlertCircle className="w-5 h-5" />}
            <span className="font-bold text-sm">{notification.message}</span>
          </motion.div>
        )}
      </AnimatePresence>

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

        <div className="p-4 border-t border-white/5 space-y-2">
          <button 
            onClick={() => setIsRefreshConfirmOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-slate-400 hover:bg-white/5 hover:text-slate-200 transition-all"
          >
            <AlertCircle className="w-6 h-6 shrink-0" />
            <span className="font-medium hidden md:block">Refresh Data</span>
          </button>
          
          <button 
            onClick={logout}
            className="w-full flex items-center gap-3 p-3 rounded-xl text-red-400 hover:bg-red-500/10 transition-all"
          >
            <LogOut className="w-6 h-6 shrink-0" />
            <span className="font-medium hidden md:block">Sign Out</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="pl-20 md:pl-64 min-h-screen">
        <header className="sticky top-0 bg-[#0F172A]/80 backdrop-blur-md border-b border-white/5 z-30 px-8 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold capitalize">{view}</h2>
          <div className="flex items-center gap-3">
            <div className="relative hidden lg:block mr-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search members..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#1E293B] border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/50 w-48 xl:w-64 transition-all"
              />
            </div>
            <button 
              onClick={() => setIsAddMemberOpen(true)}
              className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-lg"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Member</span>
            </button>
            <button 
              onClick={() => setIsAddLoanOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-blue-500/20"
            >
              <HandCoins className="w-4 h-4" />
              <span className="hidden sm:inline">Apply for Loan</span>
            </button>
            <button 
              onClick={() => setIsAddContributionOpen(true)}
              className="bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-full text-sm font-bold flex items-center gap-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Record Contribution</span>
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
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-slate-400 text-sm border-b border-white/5">
                          <th className="pb-4 font-medium">Name</th>
                          <th className="pb-4 font-medium">Slots</th>
                          <th className="pb-4 font-medium">Recent Contribution</th>
                          <th className="pb-4 font-medium">Status</th>
                          <th className="pb-4 font-medium text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {filteredMembers.map((member) => (
                          <tr key={member.id} className="group hover:bg-white/5 transition-colors">
                            <td className="py-4 font-medium">{member.name}</td>
                            <td className="py-4">{member.slots}</td>
                            <td className="py-4 text-slate-400 text-sm">
                              {memberLatestContribution[member.id] || 'No contributions'}
                            </td>
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
                                  title="View Details"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                                <button 
                                  onClick={() => { setEditingMember(member); setIsEditMemberOpen(true); }}
                                  className="p-2 hover:bg-blue-500/10 hover:text-blue-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  title="Edit Member"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </button>
                                <button 
                                  onClick={() => { setMemberToDelete(member); setIsDeleteConfirmOpen(true); }}
                                  className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                  title="Delete Member"
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
                          contributionHistory.slice(0, 5).map((tx) => {
                            const isContribution = !('type' in tx);
                            const typeLabel = isContribution ? 'Contribution' : tx.type;
                            const periodLabel = isContribution ? tx.period : '';
                            
                            return (
                              <div key={tx.id} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                                <div className="flex items-center gap-3">
                                  <div className={`p-2 rounded-lg ${typeLabel === 'Contribution' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-blue-500/20 text-blue-500'}`}>
                                    {typeLabel === 'Contribution' ? <ArrowUpRight className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                                  </div>
                                  <div>
                                    <p className="font-medium">{typeLabel}</p>
                                    <p className="text-xs text-slate-400">
                                      {formatDate(tx.date)} {periodLabel ? `• ${periodLabel}` : ''}
                                      {isContribution ? ` • ${MONTHS.find(m => m.value === tx.month)?.label} ${tx.year}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <p className="font-bold">{formatCurrency(tx.amount)}</p>
                              </div>
                            );
                          })
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
                        {loans.filter(l => (l.member_id === selectedMember.id || l.borrower_name === selectedMember.name || l.guarantor_id === selectedMember.id) && l.status === 'Active').length > 0 ? (
                          loans.filter(l => (l.member_id === selectedMember.id || l.borrower_name === selectedMember.name || l.guarantor_id === selectedMember.id) && l.status === 'Active').map((loan) => (
                            <div key={loan.id} className="p-4 rounded-xl bg-white/5 space-y-3">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-bold text-sm text-emerald-500 mb-1">{loan.debtor_name}</p>
                                  <p className="font-bold text-lg">{formatCurrency(loan.principal)}</p>
                                  <p className="text-xs text-slate-400">Due: {formatDate(loan.due_at)}</p>
                                  {loan.guarantor_id === selectedMember.id && loan.member_id !== selectedMember.id && (
                                    <p className="text-[10px] text-blue-400 font-bold uppercase mt-1">Guaranteed by you</p>
                                  )}
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
                <Card key={member.id} className="hover:border-emerald-500/30 transition-all group relative">
                  <div className="flex items-center gap-4 mb-4 cursor-pointer" onClick={() => { handleSelectMember(member); setView('dashboard'); }}>
                    <div className="w-12 h-12 bg-slate-700 rounded-xl flex items-center justify-center text-xl font-bold text-white">
                      {member.name[0]}
                    </div>
                    <div>
                      <h3 className="font-bold text-lg">{member.name}</h3>
                      <p className="text-slate-400 text-sm">{member.slots} Slots • {member.status}</p>
                    </div>
                  </div>
                  <div className="flex justify-between items-center pt-4 border-t border-white/5">
                    <span className="text-xs text-slate-500">Joined {formatDate(member.joined_at)}</span>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setEditingMember(member); setIsEditMemberOpen(true); }}
                        className="p-2 hover:bg-blue-500/10 hover:text-blue-500 rounded-lg transition-all"
                        title="Edit Member"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setMemberToDelete(member); setIsDeleteConfirmOpen(true); }}
                        className="p-2 hover:bg-red-500/10 hover:text-red-500 rounded-lg transition-all"
                        title="Delete Member"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => { handleSelectMember(member); setView('dashboard'); }}
                        className="p-2 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-lg transition-all"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
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
                    const isContribution = !('type' in tx);
                    const typeLabel = isContribution ? 'Contribution' : tx.type;
                    const periodLabel = isContribution ? tx.period : '';
                    
                    return (
                      <div key={tx.id} className="flex items-center justify-between p-4 rounded-xl hover:bg-white/5 transition-all border-b border-white/5 last:border-0">
                        <div className="flex items-center gap-4">
                          <div className={`p-2 rounded-lg ${typeLabel === 'Contribution' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-blue-500/10 text-blue-500'}`}>
                            {typeLabel === 'Contribution' ? <ArrowUpRight className="w-5 h-5" /> : <Calendar className="w-5 h-5" />}
                          </div>
                          <div>
                            <p className="font-bold">{member?.name || 'Unknown Member'}</p>
                            <p className="text-xs text-slate-400">
                              {formatDate(tx.date)} • {typeLabel} {periodLabel ? `• ${periodLabel}` : ''}
                              {isContribution ? ` • ${MONTHS.find(m => m.value === tx.month)?.label} ${tx.year}` : ''}
                            </p>
                          </div>
                        </div>
                        <p className={`font-black text-lg ${typeLabel === 'Contribution' ? 'text-emerald-500' : 'text-blue-400'}`}>
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
              onChange={e => setNewMember({...newMember, slots: parseInt(e.target.value) || 0})}
              className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
            />
          </div>
          <button type="submit" className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/20">
            Create Member Account
          </button>
        </form>
      </Modal>

      <Modal isOpen={isEditMemberOpen} onClose={() => setIsEditMemberOpen(false)} title="Edit Member Details">
        {editingMember && (
          <form onSubmit={handleEditMember} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Full Name</label>
              <input 
                type="text" 
                required
                value={editingMember.name}
                onChange={e => setEditingMember({...editingMember, name: e.target.value})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Slots</label>
                <input 
                  type="number" 
                  min="1"
                  required
                  value={editingMember.slots}
                  onChange={e => setEditingMember({...editingMember, slots: parseInt(e.target.value) || 0})}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Status</label>
                <select 
                  value={editingMember.status}
                  onChange={e => setEditingMember({...editingMember, status: e.target.value})}
                  className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
                >
                  <option value="Active">Active</option>
                  <option value="Inactive">Inactive</option>
                </select>
              </div>
            </div>
            <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-xl font-bold transition-all shadow-lg shadow-blue-500/20">
              Update Member Information
            </button>
          </form>
        )}
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
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Month</label>
              <select 
                value={newContribution.month}
                onChange={e => setNewContribution({...newContribution, month: e.target.value})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Year</label>
              <input 
                type="number"
                value={newContribution.year}
                onChange={e => setNewContribution({...newContribution, year: parseInt(e.target.value) || new Date().getFullYear()})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Period</label>
              <select 
                value={newContribution.period}
                onChange={e => setNewContribution({...newContribution, period: e.target.value as any})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              >
                <option 
                  value="15th" 
                  disabled={newContribution.member_id ? paidPeriods[`${newContribution.member_id}-${newContribution.month}-${newContribution.year}`]?.has('15th') : false}
                >
                  15th {newContribution.member_id && paidPeriods[`${newContribution.member_id}-${newContribution.month}-${newContribution.year}`]?.has('15th') ? '(Paid)' : ''}
                </option>
                <option 
                  value="30th" 
                  disabled={newContribution.member_id ? paidPeriods[`${newContribution.member_id}-${newContribution.month}-${newContribution.year}`]?.has('30th') : false}
                >
                  30th {newContribution.member_id && paidPeriods[`${newContribution.member_id}-${newContribution.month}-${newContribution.year}`]?.has('30th') ? '(Paid)' : ''}
                </option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Amount (₱500/slot)</label>
              <input 
                type="number" 
                step="500"
                required
                value={newContribution.amount}
                onChange={e => setNewContribution({...newContribution, amount: parseFloat(e.target.value) || 0})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50"
              />
            </div>
          </div>
          <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5">
            <input 
              type="checkbox" 
              id="isFirst"
              disabled={newContribution.member_id ? paidAnnualFeeMembers.has(newContribution.member_id) : false}
              checked={newContribution.isFirstOfYear}
              onChange={e => setNewContribution({...newContribution, isFirstOfYear: e.target.checked})}
              className="w-5 h-5 rounded border-white/10 bg-[#1E293B] text-emerald-500 focus:ring-emerald-500/50 disabled:opacity-50"
            />
            <label htmlFor="isFirst" className={`text-sm font-medium ${newContribution.member_id && paidAnnualFeeMembers.has(newContribution.member_id) ? 'text-slate-500' : ''}`}>
              {newContribution.member_id && paidAnnualFeeMembers.has(newContribution.member_id) 
                ? 'Annual Fee Paid for this Year' 
                : 'Include Annual Fee (₱200/slot)'}
            </label>
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
                onChange={e => setNewLoan({...newLoan, amount: parseFloat(e.target.value) || 0})}
                className="w-full bg-[#1E293B] border border-white/10 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Term (Months)</label>
              <select 
                value={newLoan.months}
                onChange={e => setNewLoan({...newLoan, months: parseInt(e.target.value) || 1})}
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
              onChange={e => setLoanPayment({...loanPayment, amount: parseFloat(e.target.value) || 0})}
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

      <Modal 
        isOpen={isRefreshConfirmOpen} 
        onClose={() => setIsRefreshConfirmOpen(false)} 
        title="Confirm Database Purge"
      >
        <div className="space-y-6">
          <div className="flex items-center gap-4 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500">
            <AlertCircle className="w-8 h-8 shrink-0" />
            <p className="text-sm font-medium leading-relaxed">
              <strong>Warning:</strong> This action will permanently delete ALL data from the database, including members, contributions, and loans. This cannot be undone.
            </p>
          </div>
          
          <div className="flex gap-3">
            <button 
              onClick={() => setIsRefreshConfirmOpen(false)}
              className="flex-1 px-6 py-3 bg-white/5 border border-white/10 rounded-xl font-bold hover:bg-white/10 transition-all"
            >
              Cancel
            </button>
            <button 
              onClick={handleRefreshData}
              className="flex-1 px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-500/20"
            >
              Confirm Purge
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
                  <p><strong>Lender:</strong> Fund Holder/Representative, representing the Savers Fund Collective.</p>
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
                    <p className="text-xl font-bold">{formatDate(contractLoan.due_at)}</p>
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
                      <td className="border border-slate-200 p-2">Total Interest (6% Monthly)</td>
                      <td className="border border-slate-200 p-2 text-right">{formatCurrency(contractLoan.totalInterest)}</td>
                    </tr>
                    <tr className="bg-slate-50 font-bold">
                      <td className="border border-slate-200 p-2">Total Repayment Amount</td>
                      <td className="border border-slate-200 p-2 text-right">{formatCurrency(contractLoan.principal + contractLoan.totalInterest)}</td>
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
                      <p className="text-sm mt-1">Fund Holder/Representative</p>
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
