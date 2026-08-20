[1mdiff --git a/package-lock.json b/package-lock.json[m
[1mindex 501f808..d19f0a5 100644[m
[1m--- a/package-lock.json[m
[1m+++ b/package-lock.json[m
[36m@@ -9,7 +9,7 @@[m
       "version": "2.0.0",[m
       "dependencies": {[m
         "express": "^4.18.2",[m
[31m-        "mongodb": "^6.3.0"[m
[32m+[m[32m        "mongodb": "^6.21.0"[m
       },[m
       "devDependencies": {[m
         "babel-jest": "^30.4.1",[m
[1mdiff --git a/package.json b/package.json[m
[1mindex dc8a7fe..5727f20 100644[m
[1m--- a/package.json[m
[1m+++ b/package.json[m
[36m@@ -8,7 +8,7 @@[m
   },[m
   "dependencies": {[m
     "express": "^4.18.2",[m
[31m-    "mongodb": "^6.3.0"[m
[32m+[m[32m    "mongodb": "^6.21.0"[m
   },[m
   "devDependencies": {[m
     "babel-jest": "^30.4.1",[m
[1mdiff --git a/public/app.jsx b/public/app.jsx[m
[1mindex 4c2d17b..de55657 100644[m
[1m--- a/public/app.jsx[m
[1m+++ b/public/app.jsx[m
[36m@@ -1059,6 +1059,8 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
                 if (!statusValido) return false;[m
                 const ref = db.acionamento_at ? new Date(db.acionamento_at) : null;[m
                 const minutos = ref ? diffMinutes(ref, now) : null;[m
[32m+[m[32m                const chegada = rowContinum?.chegada || null;[m
[32m+[m[32m                const minutosTotal = chegada ? diffMinutes(chegada, now) : null;[m
                 return {[m
                     carga: cargaInt,[m
                     fornecedor: db.fornecedor || rowContinum?.fornecedor || '--',[m
[36m@@ -1068,6 +1070,7 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
                     doca: db.doca,[m
                     acionado: ref,[m
                     minutosDoca: minutos,[m
[32m+[m[32m                    minutosTotal,[m
                 };[m
             })[m
             .filter(Boolean);       [m
[36m@@ -1079,9 +1082,9 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
             .map(row => {[m
                 const ref = row.acionado || row.chegada;[m
                 const minutos = ref ? diffMinutes(ref, now) : null;[m
[31m-                return { ...row, doca: dbState[row.carga]?.doca || '--', minutosDoca: minutos };[m
[31m-            });[m
[31m-        [m
[32m+[m[32m                 const minutosTotal = row.chegada ? diffMinutes(row.chegada, now) : null;[m
[32m+[m[32m                return { ...row, doca: dbState[row.carga]?.doca || '--', minutosDoca: minutos, minutosTotal};[m
[32m+[m[32m            });[m[41m        [m
 [m
         return [...manuais, ...doContinum][m
             .sort((a, b) => (b.minutosDoca || 0) - (a.minutosDoca || 0));[m
[36m@@ -1199,7 +1202,7 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
 [m
             <div className="bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">[m
                 <div className="px-4 py-3 text-center border-b border-slate-200 flex flex-col items-start gap-2">[m
[31m-                    <h3 className="text-lg text-center font-bold text-slate-800 uppercase tracking-widest">Cargas em Doca - {conferencia.length}</h3>[m
[32m+[m[32m                    <h3 className="text-lg text-center font-bold text-slate-800 uppercase tracking-widest">teste - {conferencia.length}</h3>[m
                 </div>[m
 [m
 [m
[36m@@ -1208,7 +1211,7 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
                     <table className="w-full text-xs">[m
                         <thead>[m
                             <tr className="border-b border-slate-300 bg-slate-100">[m
[31m-[m
[32m+[m[32m                                <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">TEMPO TOTAL</th>[m
                                 <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">TEMPO DOCA</th>[m
                                 <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">CARGA</th>[m
                                 <th className="text-center py-2 px-3 text-base  text-slate-700 font-semibold">FORNECEDOR</th>[m
[36m@@ -1222,7 +1225,9 @@[m [mfunction DashboardDoca({ data, dbState, efMap, desfazerDoca, atualizarDoca }) {[m
                         <tbody>[m
                             {conferencia.map((row, i) => ([m
                                 <tr key={i} className={`border-b border-slate-200 table-row-hover `}>[m
[31m-                                   [m
[32m+[m[32m                                    <td className={`py-2 px-3 text-center font-mono font-bold text-xl ${getAguardandoSLAColor(row.minutosTotal)}`}>[m
[32m+[m[32m                                        {formatDuration(row.minutosTotal)}[m
[32m+[m[32m                                        </td>[m
                                     <td className={`py-2 px-3 text-center font-mono font-bold text-xl ${getDocaSLAColor(row.minutosDoca)}`}>[m
                                         {formatDuration(row.minutosDoca)}[m
                                     </td>[m
