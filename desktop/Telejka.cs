using System;
using System.Diagnostics;
using System.IO;
using System.Reflection;
using System.Windows.Forms;
using System.Drawing;
[assembly: AssemblyTitle("TELEJKA")]
[assembly: AssemblyProduct("TELEJKA")]
[assembly: AssemblyVersion("1.0.0.0")]
static class Telejka {
 static readonly string AppDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "TELEJKA");
 static readonly string Target = Path.Combine(AppDir, "TELEJKA.exe");
 static string Browser() {
  foreach (string root in new[]{Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86),Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles),Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData)})
   foreach(string relative in new[]{@"Microsoft\Edge\Application\msedge.exe",@"Google\Chrome\Application\chrome.exe"}) {
    string path=Path.Combine(root,relative); if(File.Exists(path))return path;
   }
  return null;
 }
 static void Launch() {
  string browser=Browser();
  if(browser==null)throw new Exception("Для TELEJKA нужен Microsoft Edge или Google Chrome. Установите браузер и запустите приложение ещё раз.");
  Process.Start(new ProcessStartInfo(browser,"--app=https://telejka.vercel.app/feed") {UseShellExecute=true});
 }
 static void Shortcut(string folder) {
  string path=Path.Combine(folder,"TELEJKA.lnk");
  Type t=Type.GetTypeFromProgID("WScript.Shell"); object shell=Activator.CreateInstance(t);
  object link=t.InvokeMember("CreateShortcut",BindingFlags.InvokeMethod,null,shell,new object[]{path});
  Type lt=link.GetType();
  lt.InvokeMember("TargetPath",BindingFlags.SetProperty,null,link,new object[]{Target});
  lt.InvokeMember("IconLocation",BindingFlags.SetProperty,null,link,new object[]{Target+",0"});
  lt.InvokeMember("Description",BindingFlags.SetProperty,null,link,new object[]{"TELEJKA"});
  lt.InvokeMember("Save",BindingFlags.InvokeMethod,null,link,null);
 }
 [STAThread] static int Main(string[] args) {
  if(args.Length==1 && args[0]=="--check")return Browser()==null?2:0;
  Application.EnableVisualStyles();
  try {
   if(string.Equals(Path.GetFullPath(Application.ExecutablePath),Path.GetFullPath(Target),StringComparison.OrdinalIgnoreCase)){Launch();return 0;}
   using(Form form=new Form()) {
    form.Text="Установка TELEJKA";form.ClientSize=new Size(440,245);form.FormBorderStyle=FormBorderStyle.FixedDialog;
    form.MaximizeBox=false;form.StartPosition=FormStartPosition.CenterScreen;form.Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
    form.BackColor=Color.FromArgb(243,248,235);form.Font=new Font("Segoe UI",10);
    var title=new Label{Text="TELEJKA для Windows",Left=26,Top=24,Width=390,Height=35,Font=new Font("Segoe UI",18,FontStyle.Bold)};
    var description=new Label{Text="Отдельное окно, ярлык в меню «Пуск» и на рабочем столе.\n\nРаботает через Edge или Chrome. Нужен интернет.",Left=28,Top=75,Width=385,Height=90};
    var install=new Button{Text="Установить и открыть",Left=28,Top=182,Width=250,Height=38,BackColor=Color.FromArgb(205,236,158)};
    install.Click+=(sender,e)=>{try{if(Browser()==null)throw new Exception("Сначала установите Microsoft Edge или Google Chrome.");Directory.CreateDirectory(AppDir);File.Copy(Application.ExecutablePath,Target,true);Shortcut(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory));Shortcut(Environment.GetFolderPath(Environment.SpecialFolder.Programs));Launch();form.Close();}catch(Exception error){MessageBox.Show(error.Message,"TELEJKA",MessageBoxButtons.OK,MessageBoxIcon.Error);}};
    form.Controls.AddRange(new Control[]{title,description,install});Application.Run(form);
   }
   return 0;
  }catch(Exception error){MessageBox.Show(error.Message,"TELEJKA",MessageBoxButtons.OK,MessageBoxIcon.Error);return 1;}
 }
}
