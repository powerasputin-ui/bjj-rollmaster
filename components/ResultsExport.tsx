import React, { useMemo } from 'react';
import type { AgeCategory, Competitor, Match, WeightCategory } from '../types';
import type { TranslationKeys } from '../translations';
import { Icons } from '../constants';
import { computeTournamentResults } from '../services/results';

interface ResultsExportProps {
  competitors: Competitor[];
  matches: Match[];
  weightCategories: WeightCategory[];
  ageCategories?: AgeCategory[];
  t: TranslationKeys;
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

const ResultsExport: React.FC<ResultsExportProps> = ({ competitors, matches, weightCategories, ageCategories = [], t }) => {
  const results = useMemo(() => computeTournamentResults(matches, competitors, weightCategories, t, ageCategories), [matches, competitors, weightCategories, t, ageCategories]);

  const downloadCsv = () => {
    const header = ['Category', 'Gold', 'Gold Team', 'Silver', 'Silver Team', 'Bronze', 'Bronze Team'];
    const rows = results.map(r => [
      r.label,
      r.gold?.name ?? '',
      r.gold?.team ?? '',
      r.silver?.name ?? '',
      r.silver?.team ?? '',
      r.bronze.map(b => b.name).join(' / '),
      r.bronze.map(b => b.team).join(' / '),
    ]);
    const csv = [header, ...rows].map(row => row.map(csvEscape).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'tournament_results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-10 animate-in fade-in duration-700">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-6 mb-12">
        <div>
          <h2 className="text-4xl font-black text-white tracking-tight mb-2">{t.resultsTitle}</h2>
          <p className="text-slate-500 font-medium">{t.resultsSub}</p>
        </div>
        <div className="flex gap-3 print:hidden">
          <button onClick={() => window.print()} className="bg-slate-800 hover:bg-slate-700 text-white text-xs font-black uppercase tracking-widest px-6 py-4 rounded-2xl transition-all active:scale-95">{t.printButton}</button>
          <button onClick={downloadCsv} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-black uppercase tracking-widest px-6 py-4 rounded-2xl transition-all active:scale-95">{t.downloadCsvButton}</button>
        </div>
      </div>

      {results.length === 0 ? (
        <div className="py-40 text-center bg-slate-900/20 rounded-[4rem] border-2 border-dashed border-slate-800/40 flex flex-col items-center">
          <div className="text-slate-800 mb-8 scale-[2]"><Icons.Trophy /></div>
          <p className="text-slate-600 font-black uppercase tracking-[0.3em] text-sm">{t.waitingForResults}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {results.map(cat => (
            <div key={cat.bracketId} className="bg-slate-900/40 border border-slate-800 rounded-[2rem] p-6 print:border-slate-300">
              <h3 className="text-sm font-black uppercase tracking-widest text-white mb-4">{cat.label}</h3>
              {!cat.concluded ? (
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-600 italic">{t.resultsInProgress}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {cat.gold && (
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-amber-400">{t.firstPlace}</span>
                      <p className="text-white font-bold">{cat.gold.name}</p>
                      <p className="text-slate-500 text-xs">{cat.gold.team}</p>
                    </div>
                  )}
                  {cat.silver && (
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-300">{t.secondPlace}</span>
                      <p className="text-white font-bold">{cat.silver.name}</p>
                      <p className="text-slate-500 text-xs">{cat.silver.team}</p>
                    </div>
                  )}
                  {cat.bronze.length > 0 && (
                    <div>
                      <span className="text-[9px] font-black uppercase tracking-widest text-orange-600">{t.thirdPlace}</span>
                      {cat.bronze.map(b => (
                        <div key={b.id}>
                          <p className="text-white font-bold">{b.name}</p>
                          <p className="text-slate-500 text-xs">{b.team}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResultsExport;
