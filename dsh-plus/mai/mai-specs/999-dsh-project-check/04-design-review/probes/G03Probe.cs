using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.InteropServices;
using Microsoft.Win32.SafeHandles;

// Isolated design probe only. Not a provider or production implementation.
public static class G03Probe
{
    [StructLayout(LayoutKind.Sequential)] struct UnicodeString { public ushort Length, MaximumLength; public IntPtr Buffer; }
    [StructLayout(LayoutKind.Sequential)] struct ObjectAttributes { public int Length; public IntPtr RootDirectory, ObjectName; public uint Attributes; public IntPtr SecurityDescriptor, SecurityQualityOfService; }
    [StructLayout(LayoutKind.Sequential)] struct IoStatus { public IntPtr Status, Information; }
    [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)]
    static extern SafeFileHandle CreateFileW(string name, uint access, uint share, IntPtr security, uint disposition, uint flags, IntPtr template);
    [DllImport("ntdll.dll")] static extern int NtCreateFile(out SafeFileHandle handle, uint access, ref ObjectAttributes attributes, out IoStatus status, IntPtr size, uint fileAttributes, uint share, uint disposition, uint options, IntPtr ea, uint eaLength);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool SetFileInformationByHandle(SafeFileHandle handle, int infoClass, IntPtr buffer, uint size);
    [DllImport("ntdll.dll")] static extern int NtSetInformationFile(SafeFileHandle handle, out IoStatus io, IntPtr buffer, uint size, int infoClass);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool WriteFile(SafeFileHandle handle, byte[] bytes, uint count, out uint written, IntPtr overlapped);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool FlushFileBuffers(SafeFileHandle handle);
    [DllImport("kernel32.dll", SetLastError=true)] static extern bool DeviceIoControl(SafeFileHandle handle, uint code, byte[] input, uint inputLength, IntPtr output, uint outputLength, out uint returned, IntPtr overlapped);

    static readonly List<string> Rows = new List<string>();
    static void Record(string test, bool pass, string detail) { Rows.Add(test + " | " + (pass ? "PASS" : "FAIL_OR_BLOCKED") + " | " + detail); }
    static SafeFileHandle DirectoryHandle(string path, uint access, uint share = 3) {
        SafeFileHandle h = CreateFileW(path, access, share, IntPtr.Zero, 3, 0x02200000, IntPtr.Zero);
        if (h.IsInvalid) { int e = Marshal.GetLastWin32Error(); h.Dispose(); throw new IOException("Directory open error=" + e); }
        return h;
    }
    static int Relative(SafeFileHandle parent, string name, bool directory, bool create, uint share, out SafeFileHandle result) {
        IntPtr chars = Marshal.StringToHGlobalUni(name), unicode = IntPtr.Zero;
        try {
            UnicodeString u = new UnicodeString { Length=checked((ushort)(name.Length*2)), MaximumLength=checked((ushort)(name.Length*2)), Buffer=chars };
            unicode = Marshal.AllocHGlobal(Marshal.SizeOf(typeof(UnicodeString))); Marshal.StructureToPtr(u, unicode, false);
            ObjectAttributes a = new ObjectAttributes { Length=Marshal.SizeOf(typeof(ObjectAttributes)), RootDirectory=parent.DangerousGetHandle(), ObjectName=unicode, Attributes=0x1040 };
            IoStatus io;
            uint access = directory ? 0x001000A0u : 0x40110000u;
            return NtCreateFile(out result, access, ref a, out io, IntPtr.Zero, 0, share, create ? 2u : 1u, directory ? 0x21u : 0x60u, IntPtr.Zero, 0);
        } finally { if (unicode != IntPtr.Zero) Marshal.FreeHGlobal(unicode); Marshal.FreeHGlobal(chars); }
    }
    static bool Rename(SafeFileHandle file, SafeFileHandle directory, string basename, out int error) {
        // FILE_RENAME_INFO x64: BOOLEAN offset 0, HANDLE offset 8, DWORD offset 16, WCHAR[] offset 20.
        byte[] name = System.Text.Encoding.Unicode.GetBytes(basename);
        IntPtr b = Marshal.AllocHGlobal(20 + name.Length + 2);
        try {
            Marshal.Copy(new byte[20 + name.Length + 2], 0, b, 20 + name.Length + 2);
            Marshal.WriteIntPtr(b, 8, directory.DangerousGetHandle()); Marshal.WriteInt32(b, 16, name.Length); Marshal.Copy(name, 0, IntPtr.Add(b,20), name.Length);
            bool win32 = SetFileInformationByHandle(file, 3, b, (uint)(20 + name.Length + 2));
            int winError = win32 ? 0 : Marshal.GetLastWin32Error();
            Rows.Add("win32_rename_diagnostic | OBSERVED | success="+win32+" Win32="+winError);
            if (win32) { error=0; return true; }
            IoStatus io; error=NtSetInformationFile(file,out io,b,(uint)(20+name.Length),10);
            return error==0;
        } finally { Marshal.FreeHGlobal(b); }
    }
    static bool Delete(SafeFileHandle file, out int error) {
        IntPtr b=Marshal.AllocHGlobal(1);
        try { Marshal.WriteByte(b,1); bool ok=SetFileInformationByHandle(file,4,b,1); error=ok ? 0 : Marshal.GetLastWin32Error(); return ok; }
        finally { Marshal.FreeHGlobal(b); }
    }
    static byte[] Junction(string outside) {
        string substitute = "\\??\\" + outside;
        byte[] sub=System.Text.Encoding.Unicode.GetBytes(substitute), print=System.Text.Encoding.Unicode.GetBytes(outside);
        byte[] data=new byte[16+sub.Length+2+print.Length+2];
        Array.Copy(BitConverter.GetBytes(0xA0000003u),0,data,0,4);
        Array.Copy(BitConverter.GetBytes(checked((ushort)(data.Length-8))),0,data,4,2);
        Array.Copy(BitConverter.GetBytes(checked((ushort)sub.Length)),0,data,10,2);
        Array.Copy(BitConverter.GetBytes(checked((ushort)(sub.Length+2))),0,data,12,2);
        Array.Copy(BitConverter.GetBytes(checked((ushort)print.Length)),0,data,14,2);
        Array.Copy(sub,0,data,16,sub.Length); Array.Copy(print,0,data,18+sub.Length,print.Length); return data;
    }
    public static string[] RunStrict(string root) {
        Rows.Clear(); if (IntPtr.Size != 8) throw new NotSupportedException("x64 only");
        Directory.CreateDirectory(root);
        string target=Path.Combine(root,"reports"), outside=Path.Combine(root,"outside");
        Directory.CreateDirectory(target); Directory.CreateDirectory(outside);
        File.WriteAllText(Path.Combine(target,"existing.md"),"OLD-SENTINEL");
        // Overlapping handles model both acquisition orders. No race-luck assertion.
        using(SafeFileHandle prior=CreateFileW(target,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
            if(prior.IsInvalid) throw new IOException("Prior writer control failed: "+Marshal.GetLastWin32Error());
            using(SafeFileHandle rejected=CreateFileW(target,0x001000A0,1,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
                int e=rejected.IsInvalid ? Marshal.GetLastWin32Error() : 0;
                Record("strict_pin_rejects_prior_writer",rejected.IsInvalid && e==32,"Win32="+e);
            }
        }
        using(SafeFileHandle parent=DirectoryHandle(root,0x001000A0,1)) {
            SafeFileHandle directory; int s=Relative(parent,"reports",true,false,1,out directory);
            Record("strict_relative_directory",s==0,"NTSTATUS=0x"+s.ToString("X8"));
            using(directory) {
                if(s!=0) return Rows.ToArray();
                using(SafeFileHandle writer=CreateFileW(target,0x40000000,7,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
                    int e=writer.IsInvalid ? Marshal.GetLastWin32Error() : 0;
                    Record("strict_pin_rejects_new_writer",writer.IsInvalid && e==32,"Win32="+e+"; FSCTL not issued without writable handle");
                }
                foreach(string name in new string[]{"fresh-stage.tmp","collision-stage.tmp"}) {
                    SafeFileHandle file; s=Relative(directory,name,false,true,0,out file);
                    Record("strict_stage_"+name,s==0,"NTSTATUS=0x"+s.ToString("X8"));
                    using(file) {
                        if(s!=0) continue;
                        uint written; byte[] bytes=System.Text.Encoding.UTF8.GetBytes("synthetic-strict-report");
                        bool wrote=WriteFile(file,bytes,(uint)bytes.Length,out written,IntPtr.Zero);
                        Record("strict_write_"+name,wrote && written==bytes.Length && FlushFileBuffers(file),"bytes="+written);
                        string destination=name=="fresh-stage.tmp" ? "fresh.md" : "existing.md";
                        // Call native API directly; no Win32 fallback obscures the measured result.
                        byte[] encoded=System.Text.Encoding.Unicode.GetBytes(destination);
                        IntPtr b=Marshal.AllocHGlobal(20+encoded.Length);
                        int status;
                        try {
                            Marshal.Copy(new byte[20+encoded.Length],0,b,20+encoded.Length);
                            Marshal.WriteIntPtr(b,8,directory.DangerousGetHandle()); Marshal.WriteInt32(b,16,encoded.Length);
                            Marshal.Copy(encoded,0,IntPtr.Add(b,20),encoded.Length);
                            IoStatus io; status=NtSetInformationFile(file,out io,b,(uint)(20+encoded.Length),10);
                        } finally { Marshal.FreeHGlobal(b); }
                        Record("strict_publish_"+destination,status==(destination=="fresh.md" ? 0 : unchecked((int)0xC0000035)),"NTSTATUS=0x"+status.ToString("X8"));
                        if(status!=0) { int e; Record("strict_handle_cleanup_"+name,Delete(file,out e),"Win32="+e); }
                    }
                }
            }
        }
        Record("strict_existing_sentinel",File.ReadAllText(Path.Combine(target,"existing.md"))=="OLD-SENTINEL","old bytes preserved");
        string fresh=Path.Combine(target,"fresh.md");
        Record("strict_fresh_bytes",File.Exists(fresh) && File.ReadAllText(fresh)=="synthetic-strict-report","fresh destination verified after handles close");
        Record("strict_outside_empty",Directory.GetFileSystemEntries(outside).Length==0,"synthetic outside only");
        // Positive control after releasing pin: demonstrate writer and FSCTL actually work here.
        string control=Path.Combine(root,"control"); Directory.CreateDirectory(control);
        using(SafeFileHandle writer=DirectoryHandle(control,0x40000000)) {
            uint returned; byte[] data=Junction(outside);
            bool set=DeviceIoControl(writer,0x900A4,data,(uint)data.Length,IntPtr.Zero,0,out returned,IntPtr.Zero);
            Record("strict_reparse_positive_control",set,"Win32="+(set?0:Marshal.GetLastWin32Error()));
            if(set) {
                byte[] remove=new byte[8]; Array.Copy(BitConverter.GetBytes(0xA0000003u),remove,4);
                bool removed=DeviceIoControl(writer,0x900AC,remove,8,IntPtr.Zero,0,out returned,IntPtr.Zero);
                Record("strict_reparse_control_removed",removed,"Win32="+(removed?0:Marshal.GetLastWin32Error()));
            }
        }
        return Rows.ToArray();
    }

    public static string[] Run(string root) {
        Rows.Clear(); if (IntPtr.Size != 8) throw new NotSupportedException("x64 only");
        Directory.CreateDirectory(root);
        string project=Path.Combine(root,"project"), target=Path.Combine(project,"reports"), outside=Path.Combine(root,"outside");
        Directory.CreateDirectory(target); Directory.CreateDirectory(outside);
        using (SafeFileHandle p=DirectoryHandle(project,0x001000A0)) {
            SafeFileHandle d; int s=Relative(p,"reports",true,false,3,out d);
            Record("relative_directory",s==0,"NTSTATUS=0x"+s.ToString("X8"));
            using(d) {
                if (s != 0) return Rows.ToArray();
                bool blocked=false; string moveDetail="";
                try { Directory.Move(project,Path.Combine(root,"moved")); }
                catch(IOException e) { blocked=true; moveDetail="HRESULT=0x"+e.HResult.ToString("X8"); }
                Record("pinned_project_rename_rejected",blocked,moveDetail);
                if (!blocked) return Rows.ToArray();
                SafeFileHandle f; s=Relative(d,"stage.tmp",false,true,0,out f);
                Record("relative_exclusive_create",s==0,"NTSTATUS=0x"+s.ToString("X8"));
                using(f) {
                    if(s!=0) return Rows.ToArray();
                    byte[] bytes=System.Text.Encoding.UTF8.GetBytes("synthetic-safe-report"); uint written;
                    bool write=WriteFile(f,bytes,(uint)bytes.Length,out written,IntPtr.Zero);
                    bool sync=write && FlushFileBuffers(f);
                    Record("write_and_flush",write && written==bytes.Length && sync,"bytes="+written);
                    int error; bool renamed=Rename(f,d,"report.md",out error);
                    Record("handle_noreplace_publish",renamed,"native NTSTATUS=0x"+error.ToString("X8"));
                    if(!renamed) { Delete(f,out error); }
                }
                File.WriteAllText(Path.Combine(target,"existing.md"),"OLD-SENTINEL");
                SafeFileHandle collision; s=Relative(d,"collision.tmp",false,true,0,out collision);
                using(collision) {
                    if(s==0) { int error; bool renamed=Rename(collision,d,"existing.md",out error);
                        Record("existing_file_preserved",!renamed && error==unchecked((int)0xC0000035) && File.ReadAllText(Path.Combine(target,"existing.md"))=="OLD-SENTINEL","native NTSTATUS=0x"+error.ToString("X8"));
                        bool deleted=Delete(collision,out error); Record("handle_cleanup",deleted,"Win32="+error);
                    } else Record("collision_stage",false,"NTSTATUS=0x"+s.ToString("X8"));
                }
                SafeFileHandle existing; s=Relative(d,"existing.md",false,true,0,out existing);
                using(existing) Record("exclusive_existing_rejected",s==unchecked((int)0xC0000035),"NTSTATUS=0x"+s.ToString("X8"));
            }
        }
        bool moved=false; Directory.Move(project,Path.Combine(root,"released")); moved=true;
        Record("rename_after_release",moved,"released handles");
        // Reparse mutation is confined to an empty synthetic directory. No recursive link cleanup.
        string junction=Path.Combine(root,"junction"); Directory.CreateDirectory(junction);
        bool set=false; uint ret;
        using(SafeFileHandle pin=DirectoryHandle(junction,0x001000A0)) {
            using(SafeFileHandle writer=CreateFileW(junction,0x40000000,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero)) {
                if(writer.IsInvalid) Rows.Add("reparse_mutation | BLOCKED | writer open Win32="+Marshal.GetLastWin32Error());
                else { byte[] data=Junction(outside); set=DeviceIoControl(writer,0x900A4,data,(uint)data.Length,IntPtr.Zero,0,out ret,IntPtr.Zero);
                    Rows.Add("reparse_mutation | "+(set ? "OBSERVED" : "BLOCKED")+" | set="+set+" Win32="+(set?0:Marshal.GetLastWin32Error())); }
            }
            if(set) {
                SafeFileHandle after; int code=Relative(pin,"after-mutation.tmp",false,true,0,out after);
                using(after) {
                    Rows.Add("relative_from_mutated_handle | OBSERVED | NTSTATUS=0x"+code.ToString("X8")+" outsideEntry="+File.Exists(Path.Combine(outside,"after-mutation.tmp")));
                    if(code==0) { int err; Record("mutated_handle_cleanup",Delete(after,out err),"Win32="+err); }
                }
            }
        }
        if(set) {
            using(SafeFileHandle baseDir=DirectoryHandle(root,0x001000A0)) {
                SafeFileHandle bad; int s=Relative(baseDir,"junction",true,false,3,out bad);
                using(bad) Record("dont_reparse_rejects_junction",s==unchecked((int)0xC000050B),"NTSTATUS=0x"+s.ToString("X8"));
            }
            using(SafeFileHandle h=DirectoryHandle(junction,0x40000000)) {
                byte[] remove=new byte[8]; Array.Copy(BitConverter.GetBytes(0xA0000003u),remove,4);
                bool removed=DeviceIoControl(h,0x900AC,remove,8,IntPtr.Zero,0,out ret,IntPtr.Zero);
                Record("remove_synthetic_reparse",removed,"Win32="+(removed?0:Marshal.GetLastWin32Error()));
            }
        }
        Record("outside_remains_empty",Directory.GetFileSystemEntries(outside).Length==0,"synthetic outside directory only");
        return Rows.ToArray();
    }
}
