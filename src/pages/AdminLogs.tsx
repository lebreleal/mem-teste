import { useState, useEffect } from "react";
import { fetchErrorLogs, deleteOldErrorLogs, type ErrorLog } from "@/services/adminService";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, Copy, Trash2, RefreshCw, Search } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

// ErrorLog type imported from adminService

const AdminLogs = () => {
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [logs, setLogs] = useState<ErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = (supabase as any)
        .from("app_error_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);

      if (severity !== "all") {
        query = query.eq("severity", severity);
      }
      if (search.trim()) {
        query = query.ilike("error_message", `%${search.trim()}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLogs(data || []);
    } catch (err: any) {
      toast({ title: "Erro ao carregar logs", description: err.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchLogs();
  }, [isAdmin, severity]);

  const handleSearch = () => fetchLogs();

  const handleCopyLog = (log: ErrorLog) => {
    const formatted = `## Erro: ${log.error_message}
- **Severidade:** ${log.severity}
- **Componente:** ${log.component_name || "N/A"}
- **Rota:** ${log.route || "N/A"}
- **Data:** ${format(new Date(log.created_at), "dd/MM/yyyy HH:mm:ss")}
- **User ID:** ${log.user_id || "anônimo"}

### Stack Trace
\`\`\`
${log.error_stack || "Sem stack trace"}
\`\`\`

### Metadata
\`\`\`json
${JSON.stringify(log.metadata, null, 2)}
\`\`\``;

    navigator.clipboard.writeText(formatted);
    toast({ title: "Log copiado!", description: "Cole no chat para análise." });
  };

  const handleDeleteOld = async () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    try {
      const { error } = await (supabase as any)
        .from("app_error_logs")
        .delete()
        .lt("created_at", thirtyDaysAgo.toISOString());

      if (error) throw error;
      toast({ title: "Logs antigos removidos" });
      fetchLogs();
    } catch (err: any) {
      toast({ title: "Erro", description: err.message, variant: "destructive" });
    }
  };

  const severityColor = (s: string) => {
    if (s === "error") return "destructive";
    if (s === "warning") return "secondary";
    return "outline";
  };

  if (adminLoading) return <div className="p-8 text-center text-muted-foreground">Carregando...</div>;
  if (!isAdmin) {
    navigate("/dashboard");
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-4 md:p-8 max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">Logs de Erros</h1>
        <Badge variant="outline">{logs.length}</Badge>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Filtros</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar na mensagem..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                  className="pl-9"
                />
              </div>
            </div>
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="error">Error</SelectItem>
                <SelectItem value="warning">Warning</SelectItem>
                <SelectItem value="info">Info</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" onClick={fetchLogs}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button variant="destructive" size="sm" onClick={handleDeleteOld}>
              <Trash2 className="h-4 w-4 mr-1" /> Limpar +30d
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhum log encontrado 🎉</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Data</TableHead>
                  <TableHead className="w-[80px]">Nível</TableHead>
                  <TableHead>Mensagem</TableHead>
                  <TableHead className="w-[120px]">Componente</TableHead>
                  <TableHead className="w-[100px]">Rota</TableHead>
                  <TableHead className="w-[60px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {logs.map((log) => (
                  <TableRow
                    key={log.id}
                    className="cursor-pointer"
                    onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  >
                    <TableCell className="text-xs font-mono">
                      {format(new Date(log.created_at), "dd/MM HH:mm:ss")}
                    </TableCell>
                    <TableCell>
                      <Badge variant={severityColor(log.severity) as any} className="text-xs">
                        {log.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-[400px] truncate text-sm">{log.error_message}</div>
                      {expandedId === log.id && (
                        <div className="mt-2 space-y-2">
                          {log.error_stack && (
                            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-40 whitespace-pre-wrap">
                              {log.error_stack}
                            </pre>
                          )}
                          <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-20 whitespace-pre-wrap">
                            {JSON.stringify(log.metadata, null, 2)}
                          </pre>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs">{log.component_name || "-"}</TableCell>
                    <TableCell className="text-xs">{log.route || "-"}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); handleCopyLog(log); }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminLogs;
